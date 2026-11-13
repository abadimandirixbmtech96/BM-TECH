/*!
 * bm-dokumen.js: pembuat file dokumen untuk Jarvis. Semua dibuat DI HP/BROWSER dari spesifikasi
 * { judul, nama, versi, bagian:[{t:'h'|'h2'|'p'|'ul'|'ol'|'tb'|'hr', ...}] }, tanpa server dan tanpa database.
 *   BMDok.FORMAT                      daftar format { k, label, ext, mime }
 *   BMDok.build(spec, k)  -> Promise<{ blob, name, mime }>
 *   BMDok.download(spec, k) / BMDok.share(spec, k)
 * PDF memakai jsPDF + autoTable (cdnjs, sudah dipakai dashboard). Word, Excel dan lainnya ditulis langsung
 * (arsip ZIP tanpa kompresi + XML Office Open), jadi tidak butuh pustaka lain.
 */
(function () {
  'use strict';
  if (window.BMDok) return;
  var FORMAT = [
    { k: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
    { k: 'xlsx', label: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { k: 'docx', label: 'Word', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { k: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
    { k: 'html', label: 'HTML', ext: 'html', mime: 'text/html;charset=utf-8' },
    { k: 'md', label: 'Markdown', ext: 'md', mime: 'text/markdown;charset=utf-8' },
    { k: 'txt', label: 'Teks', ext: 'txt', mime: 'text/plain;charset=utf-8' }
  ];
  var enc = new TextEncoder();
  function bytes(s) { return enc.encode(s); }
  function plain(s) { return String(s == null ? '' : s).replace(/\*\*/g, ''); }
  function xml(s) { return String(s == null ? '' : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function stamp() { var d = new Date(Date.now() + 7 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' '); }
  function accHex() {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').split(',').map(function (x) { return parseInt(x, 10); });
      if (v.length === 3 && v.every(function (n) { return n >= 0 && n <= 255; })) return v; } catch (e) {}
    return [240, 165, 41];
  }
  function hex(rgb) { return rgb.map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('').toUpperCase(); }
  function firstH(spec) { var b = (spec.bagian || [])[0]; return b && b.t === 'h' && plain(b.teks) === plain(spec.judul) ? b : null; }
  function tables(spec) { return (spec.bagian || []).filter(function (b) { return b.t === 'tb'; }); }

  /* ---------- angka: "Rp14.655.000" -> 14655000 (Excel bisa menjumlah) ---------- */
  function numOf(x) {
    if (typeof x === 'number' && isFinite(x)) return { n: x, k: Math.floor(x) === x ? 'int' : 'dec' };
    var s = String(x == null ? '' : x).trim(); if (!s || s.length > 22) return null;
    var m = /^Rp\s?(-?\d{1,3}(?:\.\d{3})*|-?\d+)(,\d+)?$/.exec(s);
    if (m) return { n: parseFloat(m[1].replace(/\./g, '') + (m[2] ? '.' + m[2].slice(1) : '')), k: 'rp' };
    if (/^-?(0|[1-9]\d{0,14})$/.test(s)) return { n: parseInt(s, 10), k: 'int' };
    if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return { n: parseInt(s.replace(/\./g, ''), 10), k: 'int' };
    if (/^-?(0|[1-9]\d{0,11}),\d{1,6}$/.test(s)) return { n: parseFloat(s.replace(',', '.')), k: 'dec' };
    return null;
  }
  function isNumLike(x) { return !!numOf(x) || /^(Rp\s?)?-?[\d.,]+%?$/.test(String(x)); }

  /* ---------- ZIP tanpa kompresi ---------- */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { var c = -1; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function zip(files) {
    var d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var nm = bytes(f.name), data = typeof f.data === 'string' ? bytes(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      parts.push(new Uint8Array(h.buffer), nm, data); central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + data.length;
    });
    var csz = central.reduce(function (n, p) { return n + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]));
  }
  var DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  /* ---------- XLSX ---------- */
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetName(n, used) {
    var s = String(n || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet', b = s, i = 2;
    while (used.indexOf(s.toLowerCase()) >= 0) s = b.slice(0, 28) + ' ' + (i++);
    used.push(s.toLowerCase()); return s;
  }
  function xlsx(spec) {
    var acc = hex(accHex()), used = [], sheets = [];
    var texts = (spec.bagian || []).filter(function (b) { return b.t !== 'tb' && b.t !== 'hr'; }), tbs = tables(spec);
    function cellS(ref, st, text) { return '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + xml(plain(text)) + '</t></is></c>'; }
    function widths(cols, rows) {
      return '<cols>' + cols.map(function (c, i) { var w = String(c).length; rows.forEach(function (r) { var l = String(r[i] == null ? '' : r[i]).length; if (l > w) w = l; }); w = Math.max(8, Math.min(48, Math.round(w * 1.15) + 2)); return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
    }
    function wrap(inner, cols, pane) {
      return DECL + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">' + (pane ? '<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' + cols + '<sheetData>' + inner + '</sheetData></worksheet>';
    }
    if (texts.length || !tbs.length) {
      var rows = [], r = 1;
      rows.push('<row r="1">' + cellS('A1', 6, spec.judul) + '</row>'); r = 3;
      texts.forEach(function (b) {
        var st = b.t === 'h' || b.t === 'h2' ? 7 : 8;
        if (b.t === 'h' && firstH(spec) === b) return;
        if (b.t === 'ul' || b.t === 'ol') b.items.forEach(function (x, i) { rows.push('<row r="' + r + '">' + cellS('A' + r, 8, (b.t === 'ol' ? (i + 1) + '. ' : '- ') + x) + '</row>'); r++; });
        else { rows.push('<row r="' + r + '">' + cellS('A' + r, st, b.teks) + '</row>'); r++; }
      });
      sheets.push({ name: sheetName(tbs.length ? 'Ringkasan' : 'Dokumen', used), xml: wrap(rows.join(''), '<cols><col min="1" max="1" width="100" customWidth="1"/></cols>', false) });
    }
    tbs.forEach(function (t, ti) {
      var rows = ['<row r="1">' + cellS('A1', 6, t.nama || spec.judul) + '</row>'];
      rows.push('<row r="3" ht="22" customHeight="1">' + t.kolom.map(function (c, i) { return cellS(colName(i) + '3', 1, c); }).join('') + '</row>');
      t.baris.forEach(function (row, ri) {
        var rn = ri + 4;
        rows.push('<row r="' + rn + '">' + t.kolom.map(function (_, i) {
          var ref = colName(i) + rn, v = row[i], nv = numOf(v);
          if (nv) return '<c r="' + ref + '" s="' + (nv.k === 'rp' ? 5 : nv.k === 'dec' ? 4 : 3) + '"><v>' + nv.n + '</v></c>';
          return cellS(ref, 2, v);
        }).join('') + '</row>');
      });
      sheets.push({ name: sheetName(t.nama || ('Tabel ' + (ti + 1)), used), xml: wrap(rows.join(''), widths(t.kolom, t.baris), true) });
    });
    var files = [
      { name: '[Content_Types].xml', data: DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { name: '_rels/.rels', data: DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: DECL + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + xml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: DECL + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot;#,##0"/></numFmts>' +
        '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1C1B19"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF' + acc + '"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
        '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
        '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
        '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s.xml }); });
    return zip(files);
  }

  /* ---------- DOCX ---------- */
  function runs(text, sz, extra) {   // **tebal** di teks jadi cetak tebal
    var out = '', parts = String(text == null ? '' : text).split('**');
    parts.forEach(function (p, i) { if (!p) return; out += '<w:r><w:rPr>' + (i % 2 ? '<w:b/>' : '') + (extra || '') + (sz ? '<w:sz w:val="' + sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xml(p) + '</w:t></w:r>'; });
    return out || '<w:r><w:t></w:t></w:r>';
  }
  function docx(spec) {
    var acc = hex(accHex()), body = '', wide = tables(spec).some(function (t) { return t.kolom.length > 6; });
    var W = wide ? 16838 : 11906, H = wide ? 11906 : 16838, M = 1134, tw = W - 2 * M;
    body += '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>' + runs(spec.judul) + '</w:p>';
    if (spec.gaya !== 'polos') body += '<w:p><w:pPr><w:spacing w:after="200"/></w:pPr>' + runs('Dibuat ' + stamp() + ' WIB oleh Jarvis, BM-TECH', 18, '<w:color w:val="7A7A7A"/>') + '</w:p>';
    (spec.bagian || []).forEach(function (b) {
      if (b === firstH(spec)) return;
      if (b.t === 'h') body += '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + runs(b.teks) + '</w:p>';
      else if (b.t === 'h2') body += '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' + runs(b.teks) + '</w:p>';
      else if (b.t === 'p') { var ls = String(b.teks).split(/\n+/); ls.forEach(function (l, li) { body += '<w:p><w:pPr><w:spacing w:after="' + (li < ls.length - 1 ? 20 : 160) + '"/></w:pPr>' + runs(l) + '</w:p>'; }); }
      else if (b.t === 'ul' || b.t === 'ol') b.items.forEach(function (x, i) { body += '<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="567" w:hanging="283"/></w:pPr><w:r><w:t>' + (b.t === 'ol' ? (i + 1) + '.' : '\u2022') + '</w:t></w:r><w:r><w:tab/></w:r>' + runs(x) + '</w:p>'; });
      else if (b.t === 'hr') body += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr></w:pPr></w:p>';
      else if (b.t === 'tb') {
        if (b.nama) body += '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' + runs(b.nama) + '</w:p>';
        var n = b.kolom.length, sz = n > 7 ? 16 : n > 5 ? 18 : 20, cw = Math.floor(tw / n);
        var bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) { return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>'; }).join('');
        body += '<w:tbl><w:tblPr><w:tblW w:w="' + tw + '" w:type="dxa"/><w:tblBorders>' + bd + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + b.kolom.map(function () { return '<w:gridCol w:w="' + cw + '"/>'; }).join('') + '</w:tblGrid>';
        body += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + b.kolom.map(function (c) { return '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + acc + '"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="' + sz + '"/></w:rPr><w:t xml:space="preserve">' + xml(plain(c)) + '</w:t></w:r></w:p></w:tc>'; }).join('') + '</w:tr>';
        b.baris.forEach(function (row, ri) {
          body += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + b.kolom.map(function (_, i) {
            var v = row[i], s = typeof v === 'number' ? v.toLocaleString('id-ID') : String(v == null ? '' : v);
            return '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/>' + (ri % 2 ? '<w:shd w:val="clear" w:color="auto" w:fill="F7F5F0"/>' : '') + '</w:tcPr><w:p><w:pPr><w:spacing w:before="30" w:after="30"/>' + (isNumLike(v) ? '<w:jc w:val="right"/>' : '') + '</w:pPr>' + runs(s, sz) + '</w:p></w:tc>';
          }).join('') + '</w:tr>';
        });
        body += '</w:tbl><w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>';
      }
    });
    var sect = '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="' + W + '" w:h="' + H + '"' + (wide ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="' + M + '" w:right="' + M + '" w:bottom="' + M + '" w:left="' + M + '" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
    var NSW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var files = [
      { name: '[Content_Types].xml', data: DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>' },
      { name: '_rels/.rels', data: DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
      { name: 'word/document.xml', data: DECL + '<w:document ' + NSW + '><w:body>' + body + sect + '</w:body></w:document>' },
      { name: 'word/footer1.xml', data: DECL + '<w:ftr ' + NSW + '><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="8C8C8C"/></w:rPr><w:t xml:space="preserve">Dibuat oleh Jarvis, BM-TECH   |   Halaman </w:t></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="8C8C8C"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="8C8C8C"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="8C8C8C"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="8C8C8C"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="8C8C8C"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>' },
      { name: 'word/styles.xml', data: DECL + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style></w:styles>' }
    ];
    return zip(files);
  }

  /* ---------- teks: CSV, TXT, MD, HTML ---------- */
  function cellText(v) { return typeof v === 'number' ? String(v) : plain(v); }
  function csv(spec) {
    function q(v) { var s = cellText(v); if (/^[=@]/.test(s) || /^[+\-][^\d.,\s]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var tbs = tables(spec), out = [];
    if (!tbs.length) (spec.bagian || []).forEach(function (b) { if (b.teks) out.push(q(b.teks)); else if (b.items) b.items.forEach(function (x) { out.push(q(x)); }); });
    tbs.forEach(function (t, i) { if (i) out.push(''); if (tbs.length > 1) out.push(q(t.nama || ('Tabel ' + (i + 1)))); out.push(t.kolom.map(q).join(';')); t.baris.forEach(function (r) { out.push(r.map(q).join(';')); }); });
    return new Blob(['\ufeff' + out.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  }
  function txt(spec) {
    var out = [plain(spec.judul), '='.repeat(Math.min(60, plain(spec.judul).length)), ''];
    (spec.bagian || []).forEach(function (b) {
      if (b === firstH(spec)) return;
      if (b.t === 'h') out.push('', plain(b.teks).toUpperCase(), '');
      else if (b.t === 'h2') out.push('', plain(b.teks), '-'.repeat(Math.min(40, plain(b.teks).length)));
      else if (b.t === 'p') out.push(plain(b.teks), '');
      else if (b.t === 'ul' || b.t === 'ol') { b.items.forEach(function (x, i) { out.push((b.t === 'ol' ? (i + 1) + '. ' : '- ') + plain(x)); }); out.push(''); }
      else if (b.t === 'hr') out.push('-'.repeat(40), '');
      else if (b.t === 'tb') {
        if (b.nama) out.push(plain(b.nama));
        var rows = [b.kolom].concat(b.baris).map(function (r) { return r.map(function (x) { return cellText(x).replace(/\s+/g, ' '); }); });
        var w = b.kolom.map(function (_, i) { return Math.min(34, rows.reduce(function (m, r) { return Math.max(m, (r[i] || '').length); }, 0)); });
        rows.forEach(function (r, ri) { out.push(r.map(function (x, i) { return (x.length > w[i] ? x.slice(0, w[i] - 1) + '~' : x).padEnd(w[i]); }).join('  ').replace(/\s+$/, '')); if (!ri) out.push(w.map(function (n) { return '-'.repeat(n); }).join('  ')); });
        out.push('');
      }
    });
    return new Blob([out.join('\r\n').replace(/\n{3,}/g, '\n\n')], { type: 'text/plain;charset=utf-8' });
  }
  function md(spec) {
    var out = ['# ' + plain(spec.judul), ''];
    (spec.bagian || []).forEach(function (b) {
      if (b === firstH(spec)) return;
      if (b.t === 'h') out.push('## ' + b.teks, ''); else if (b.t === 'h2') out.push('### ' + b.teks, '');
      else if (b.t === 'p') out.push(b.teks, '');
      else if (b.t === 'ul' || b.t === 'ol') { b.items.forEach(function (x, i) { out.push((b.t === 'ol' ? (i + 1) + '. ' : '- ') + x); }); out.push(''); }
      else if (b.t === 'hr') out.push('---', '');
      else if (b.t === 'tb') {
        var e = function (x) { return cellText(x).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' '); };
        if (b.nama) out.push('**' + b.nama + '**', '');
        out.push('| ' + b.kolom.map(e).join(' | ') + ' |', '| ' + b.kolom.map(function () { return '---'; }).join(' | ') + ' |');
        b.baris.forEach(function (r) { out.push('| ' + r.map(e).join(' | ') + ' |'); }); out.push('');
      }
    });
    return new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' });
  }
  function inl(s) { return xml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function html(spec) {
    var a = hex(accHex()), o = [];
    (spec.bagian || []).forEach(function (b) {
      if (b === firstH(spec)) return;
      if (b.t === 'h') o.push('<h2>' + inl(b.teks) + '</h2>'); else if (b.t === 'h2') o.push('<h3>' + inl(b.teks) + '</h3>');
      else if (b.t === 'p') String(b.teks).split(/\n+/).forEach(function (l) { o.push('<p style="margin:0 0 ' + (spec.gaya === 'polos' ? '2px' : '8px') + '">' + inl(l) + '</p>'); });
      else if (b.t === 'ul' || b.t === 'ol') o.push('<' + b.t + '>' + b.items.map(function (x) { return '<li>' + inl(x) + '</li>'; }).join('') + '</' + b.t + '>');
      else if (b.t === 'hr') o.push('<hr>');
      else if (b.t === 'tb') {
        o.push((b.nama ? '<h3>' + xml(b.nama) + '</h3>' : '') + '<div class="w"><table><thead><tr>' + b.kolom.map(function (c) { return '<th>' + xml(plain(c)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          b.baris.map(function (r) { return '<tr>' + r.map(function (x) { return '<td' + (isNumLike(x) ? ' class="n"' : '') + '>' + xml(cellText(x)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
      }
    });
    var s = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + xml(spec.judul) + '</title><style>' +
      'body{font:16px/1.55 system-ui,Segoe UI,Roboto,sans-serif;max-width:900px;margin:0 auto;padding:24px 16px;color:#1c1b19}h1{margin:0 0 4px;font-size:26px}.m{color:#777;font-size:13px;margin:0 0 20px}h2{font-size:20px;margin:26px 0 8px}h3{font-size:16px;margin:18px 0 6px}' +
      '.w{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th{background:#' + a + ';text-align:left}th,td{border:1px solid #d8d8d8;padding:6px 9px;vertical-align:top}tbody tr:nth-child(even){background:#f7f5f0}td.n{text-align:right;white-space:nowrap}hr{border:0;border-top:1px solid #ccc}' +
      '</style></head><body><h1>' + xml(spec.judul) + '</h1><p class="m">' + (spec.gaya === 'polos' ? '' : 'Dibuat ' + stamp() + ' WIB oleh Jarvis, BM-TECH') + '</p>' + o.join('\n') + '</body></html>';
    return new Blob([s], { type: 'text/html;charset=utf-8' });
  }

  /* ---------- PDF ---------- */
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Pustaka PDF gagal dimuat. Periksa internet lalu coba lagi.')); }; document.head.appendChild(s); }); }
  async function pdfLib() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    var d = new window.jspdf.jsPDF();
    if (typeof d.autoTable !== 'function') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    return window.jspdf.jsPDF;
  }
  function pt(s) { return String(s == null ? '' : s).replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u2026/g, '...').replace(/[\u2013\u2014]/g, '-').replace(/\*\*/g, '').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF\u2022]/g, ''); }
  async function pdf(spec) {
    var JsPDF = await pdfLib(), acc = accHex();
    var wide = tables(spec).some(function (t) { return t.kolom.length > 5; });
    var doc = new JsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    var polos = spec.gaya === 'polos';
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = polos ? 56 : 40, y;
    if (!polos) {
      doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(0, 0, W, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(28, 27, 25); doc.text('BM-TECH', M, 44);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text('Dibuat oleh Jarvis  |  ' + stamp() + ' WIB', M, 58);
      doc.setDrawColor(220); doc.line(M, 68, W - M, 68);
    }
    y = polos ? 66 : 94; doc.setTextColor(28, 27, 25); doc.setFont('helvetica', 'bold'); doc.setFontSize(polos ? 12 : 16);
    var tl = doc.splitTextToSize(pt(spec.judul), W - 2 * M); doc.text(tl, M, y); y += tl.length * (polos ? 16 : 20) + (polos ? 8 : 6);
    function room(n) { if (y + n > H - 50) { doc.addPage(); y = 50; } }
    (spec.bagian || []).forEach(function (b) {
      doc.setTextColor(28, 27, 25);
      if (b === firstH(spec)) return;
      if (b.t === 'h' || b.t === 'h2') {
        var big = b.t === 'h'; doc.setFont('helvetica', 'bold'); doc.setFontSize(big ? 13 : 11.5);
        var l = doc.splitTextToSize(pt(b.teks), W - 2 * M); room(l.length * 16 + 22); y += big ? 10 : 6; doc.text(l, M, y + 10); y += l.length * 16 + 4;
      } else if (b.t === 'p') {
        var fs = polos ? 11 : 10.5, lh = polos ? 16 : 14, lines = String(b.teks).split(/\n+/);
        lines.forEach(function (ln, li) {
          var bold = /^\s*\*\*.+\*\*\s*$/.test(ln);
          doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(fs);
          var l2 = doc.splitTextToSize(pt(ln), W - 2 * M); room(l2.length * lh + 2); doc.text(l2, M, y + 11); y += l2.length * lh + (polos ? 0 : 6);
        });
        if (polos) y += 10;
      } else if (b.t === 'ul' || b.t === 'ol') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        b.items.forEach(function (x, i) { var l3 = doc.splitTextToSize(pt(x), W - 2 * M - 18); room(l3.length * 14 + 2); doc.text(b.t === 'ol' ? (i + 1) + '.' : '\u2022', M + 2, y + 10); doc.text(l3, M + 18, y + 10); y += l3.length * 14 + 2; });
        y += 4;
      } else if (b.t === 'hr') { room(14); doc.setDrawColor(200); doc.line(M, y + 6, W - M, y + 6); y += 14; }
      else if (b.t === 'tb') {
        if (b.nama) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); room(40); doc.text(pt(b.nama), M, y + 12); y += 18; }
        room(60);
        doc.autoTable({
          startY: y + 4, head: [b.kolom.map(pt)], body: b.baris.map(function (r) { return b.kolom.map(function (_, k) { var v = r[k]; return pt(typeof v === 'number' ? v.toLocaleString('id-ID') : v); }); }), theme: 'grid', margin: { left: M, right: M, bottom: 50 },
          styles: { font: 'helvetica', fontSize: b.kolom.length > 7 ? 8 : 9, cellPadding: 4, lineColor: [225, 225, 225], textColor: [28, 27, 25] }, headStyles: { fillColor: acc, textColor: [28, 27, 25], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 245, 240] },
          didParseCell: function (d) { if (d.section === 'body' && /^(Rp\s?)?-?[\d.,]+%?$/.test(String(d.cell.raw))) d.cell.styles.halign = 'right'; }
        });
        y = doc.lastAutoTable.finalY + 12;
      }
    });
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n && !polos; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140); doc.text('Dibuat oleh Jarvis - BM-TECH', M, H - 24); doc.text('Halaman ' + i + ' / ' + n, W - M, H - 24, { align: 'right' }); }
    return doc.output('blob');
  }

  /* ---------- antarmuka ---------- */
  function fmtOf(k) { for (var i = 0; i < FORMAT.length; i++) if (FORMAT[i].k === k) return FORMAT[i]; return FORMAT[0]; }
  async function build(spec, k) {
    var f = fmtOf(k), blob;
    if (!spec || !Array.isArray(spec.bagian)) throw new Error('Isi dokumen tidak ada');
    if (f.k === 'pdf') blob = await pdf(spec); else if (f.k === 'xlsx') blob = xlsx(spec); else if (f.k === 'docx') blob = docx(spec);
    else if (f.k === 'csv') blob = csv(spec); else if (f.k === 'html') blob = html(spec); else if (f.k === 'md') blob = md(spec); else blob = txt(spec);
    if (f.k === 'xlsx' || f.k === 'docx') blob = new Blob([blob], { type: f.mime });
    var base = String(spec.nama || 'dokumen').replace(/[^\w\- ]+/g, '').trim() || 'dokumen';
    return { blob: blob, name: base + (spec.versi > 1 ? '-v' + spec.versi : '') + '.' + f.ext, mime: f.mime };
  }
  async function download(spec, k) {
    var r = await build(spec, k), u = URL.createObjectURL(r.blob), a = document.createElement('a');
    a.href = u; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 20000);
    return r;
  }
  async function share(spec, k) {
    var r = await build(spec, k), file = new File([r.blob], r.name, { type: r.mime.split(';')[0] });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: spec.judul }); return r; }
    var u = URL.createObjectURL(r.blob), a = document.createElement('a'); a.href = u; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 20000);
    r.fallback = true; return r;
  }
  window.BMDok = { FORMAT: FORMAT, fmtOf: fmtOf, build: build, download: download, share: share, numOf: numOf };
})();
