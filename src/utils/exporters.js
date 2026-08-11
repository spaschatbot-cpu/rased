/**
 * Client-side PDF export — no external dependencies.
 *
 * A styled hidden iframe is printed in place; the browser's print dialog handles
 * "Save as PDF". Avoids pulling a PDF library into the bundle.
 */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Prints a styled report from the current page — the dialog opens in place via a
 * hidden iframe, so no extra browser window and no pop-up blocker to fight.
 */
export function exportToPdf({
  title,
  subtitle,
  columns,
  rows,
  rtl = false,
  summary = [],
  brand = 'مرصاد',
  brandNote = 'منصة إدارة الأساطيل',
  footerNote = '',
}) {
  const dir = rtl ? 'rtl' : 'ltr'
  const align = rtl ? 'right' : 'left'
  const alignEnd = rtl ? 'left' : 'right'
  const numeric = (c) => c.type === 'int' || c.type === 'num'

  const summaryHtml = summary.length
    ? `<section class="cards">${summary
        .map((s) => `<div class="card"><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`)
        .join('')}</section>`
    : ''

  const head = columns
    .map((c) => `<th class="${numeric(c) ? 'num' : ''}">${esc(c.label)}</th>`)
    .join('')
  const body = rows
    .map(
      (row, i) =>
        `<tr><td class="idx">${i + 1}</td>${columns
          .map((c) => `<td class="${numeric(c) ? 'num' : ''}">${esc(row[c.key])}</td>`)
          .join('')}</tr>`,
    )
    .join('')

  const generated = new Date().toLocaleString(rtl ? 'ar-EG' : 'en-GB')

  const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body {
    font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif;
    color: #0b1524; font-size: 12px; line-height: 1.5;
    /* هامش داخلي إضافي حتى لا يلتصق المحتوى بحواف الصفحة */
    padding: 4mm 6mm;
  }

  /* ترويسة العلامة */
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding-bottom: 12px; border-bottom: 2px solid #00a97a; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark { width: 34px; height: 34px; border-radius: 10px; background: #00a97a;
          color: #04120c; font-weight: 900; font-size: 15px;
          display: flex; align-items: center; justify-content: center; }
  .brand b { display: block; font-size: 15px; letter-spacing: -0.2px; }
  .brand span { display: block; color: #5a6b83; font-size: 10.5px; }
  .stamp { text-align: ${alignEnd}; color: #5a6b83; font-size: 10.5px; }

  h1 { font-size: 19px; margin: 18px 0 3px; letter-spacing: -0.3px; }
  .sub { color: #5a6b83; font-size: 12px; margin: 0 0 16px; }

  /* بطاقات الملخّص */
  .cards { display: grid; grid-template-columns: repeat(${Math.min(4, Math.max(1, summary.length))}, 1fr);
           gap: 14px; margin: 0 0 22px; }
  .card { border: 1px solid #dfe6ef; border-${align}: 3px solid #00a97a; border-radius: 10px;
          padding: 11px 16px; background: #fbfdff; }
  .card span { display: block; color: #5a6b83; font-size: 10px; margin-bottom: 4px;
               white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card b { font-size: 14px; white-space: nowrap; }

  /* الجدول */
  table { border-collapse: collapse; width: 100%; text-align: ${align}; }
  thead { display: table-header-group; }
  th { background: #0f2233; color: #fff; font-weight: 700; font-size: 11px;
       padding: 8px 10px; white-space: nowrap; }
  th:first-child, td:first-child { text-align: center; }
  td { padding: 7px 10px; border-bottom: 1px solid #e6ecf4; font-size: 11.5px; }
  /* الأرقام محاذاة للطرف مع مسافة كافية حتى لا تلتصق بحد العمود */
  td.num, th.num { text-align: ${alignEnd}; font-variant-numeric: tabular-nums;
                   padding-${alignEnd}: 20px; }
  td:last-child, th:last-child { padding-${alignEnd}: 24px; }
  td.idx { color: #93a3b8; font-size: 10px; width: 34px; }
  tbody tr:nth-child(even) { background: #f6f9fd; }
  tbody tr { break-inside: avoid; }
  tbody tr:last-child td { border-bottom: 1px solid #cfd9e6; }

  .foot { margin-top: 14px; display: flex; justify-content: space-between;
          color: #7b8aa0; font-size: 10px; border-top: 1px solid #e6ecf4; padding-top: 8px; }

  @page { size: A4; margin: 14mm 14mm 16mm; }
</style></head>
<body>
  <header class="head">
    <div class="brand">
      <div class="mark">${esc(brand.slice(0, 1))}</div>
      <div><b>${esc(brand)}</b><span>${esc(brandNote)}</span></div>
    </div>
    <div class="stamp">${esc(rtl ? 'تاريخ الإصدار' : 'Generated')}<br/><b>${esc(generated)}</b></div>
  </header>

  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
  ${summaryHtml}

  <table>
    <colgroup><col style="width:34px"/>${columns
      .map((c) => `<col style="width:${numeric(c) ? '24%' : 'auto'}"/>`)
      .join('')}</colgroup>
    <thead><tr><th>#</th>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>

  <div class="foot">
    <span>${esc(footerNote || title)}</span>
    <span>${esc(rtl ? `عدد السجلات: ${rows.length}` : `${rows.length} records`)}</span>
  </div>
</body></html>`

  // إطار مخفي داخل نفس الصفحة — مربع الطباعة يفتح في مكانه بدون نافذة جديدة
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  // مقاس A4 تقريبي حتى يتم ترقيم الصفحات بشكل صحيح، وخارج الشاشة حتى لا يُرى
  frame.style.cssText = 'position:fixed;inset-block-start:0;left:-10000px;width:794px;height:1123px;border:0;opacity:0;'
  document.body.appendChild(frame)

  const cleanup = () => setTimeout(() => frame.remove(), 800)

  let started = false
  const startPrint = () => {
    if (started) return
    started = true
    const win = frame.contentWindow
    win.onafterprint = cleanup
    win.focus()
    win.print()
    // احتياط لو لم يُطلق المتصفح onafterprint
    setTimeout(cleanup, 60000)
  }

  frame.onload = startPrint
  // احتياط: بعض المتصفحات لا تُطلق onload مع document.write
  setTimeout(startPrint, 400)

  const doc = frame.contentDocument
  doc.open()
  doc.write(html)
  doc.close()
  return true
}
