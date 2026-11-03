import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../i18n.dart';
import 'pdf_save/save_io.dart' if (dart.library.js_interop) 'pdf_save/save_web.dart';

/// تقرير جاهز للتصدير: العنوان والفترة والملخّص، ثم جدول بأعمدته وصفوفه.
class ReportDoc {
  ReportDoc({
    required this.title,
    required this.period,
    required this.vehicles,
    required this.summary,
    required this.columns,
    required this.rows,
  });

  final String title;
  final String period;
  final String vehicles;

  /// (العنوان، القيمة) — أربع بطاقات أعلى الصفحة.
  final List<(String, String)> summary;

  final List<String> columns;
  final List<List<String>> rows;
}

const _green = PdfColor.fromInt(0xFF00C391);
const _ink = PdfColor.fromInt(0xFF0F1B2A);
const _muted = PdfColor.fromInt(0xFF66768A);
const _line = PdfColor.fromInt(0xFFE1E7EF);
const _zebra = PdfColor.fromInt(0xFFF6F8FA);

/// يبني الملف ثم يشاركه على الهاتف، أو ينزّله في المتصفح.
Future<void> shareReportPdf(ReportDoc doc, String fileName) async {
  final bytes = await buildReportPdf(doc);
  await savePdf(bytes, fileName);
}

final _arabic = RegExp(r'[؀-ۿ]');
final _latin = RegExp(r'[A-Za-z]');
final _digit = RegExp(r'[0-9]');

int _script(String c) => _arabic.hasMatch(c)
    ? 1
    : _latin.hasMatch(c)
        ? 2
        : _digit.hasMatch(c)
            ? 3
            : 0;

/// مكتبة PDF تُسقط المسافة حيث ينتقل النص بين العربية والأرقام واللاتينية:
/// «2990 JUA» تُرسم «2990JUA» و«120.5 كم» تُرسم «120.5كم». المسافة عند كل
/// انتقال تُضاعَف، فيبقى منها واحدة بعد أن تأخذ المكتبة الأخرى.
String _bidi(String s) => s.replaceAllMapped(RegExp(r'(\S) (?=(\S))'), (m) {
      final a = _script(m[1]!), b = _script(m[2]!);
      return (a != 0 && b != 0 && a != b) ? '${m[1]}  ' : '${m[1]} ';
    });

Future<Uint8List> buildReportPdf(ReportDoc doc) async {
  /* Tajawal نفسه خط الموقع؛ الخطوط المضمّنة في PDF لا تعرف العربية */
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/Tajawal-Regular.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/Tajawal-Bold.ttf'));
  final rtl = AppLocale.isArabic;
  final dir = rtl ? pw.TextDirection.rtl : pw.TextDirection.ltr;

  /* الجدول لا يقلب أعمدته مع الاتجاه، فتُعكس هنا: العمود الأول يقع يمينًا */
  List<String> ordered(List<String> list) {
    final fixed = list.map(_bidi).toList();
    return rtl ? fixed.reversed.toList() : fixed;
  }

  final now = DateTime.now().toUtc().add(const Duration(hours: 3));
  String two(int n) => n.toString().padLeft(2, '0');
  final stamp = '${two(now.day)}/${two(now.month)}/${now.year}  ${two(now.hour)}:${two(now.minute)}';

  final pdf = pw.Document(
    theme: pw.ThemeData.withFont(base: regular, bold: bold),
    title: doc.title,
    author: tr('app.title'),
  );

  pdf.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      textDirection: dir,
      margin: const pw.EdgeInsets.fromLTRB(28, 28, 28, 32),
      header: (context) => context.pageNumber == 1
          ? pw.SizedBox()
          : pw.Padding(
              padding: const pw.EdgeInsets.only(bottom: 8),
              child: pw.Text('${tr('app.title')} — ${doc.title}',
                  style: const pw.TextStyle(fontSize: 9, color: _muted)),
            ),
      footer: (context) => pw.Container(
        margin: const pw.EdgeInsets.only(top: 10),
        padding: const pw.EdgeInsets.only(top: 6),
        decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: _line))),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text('${tr('pdf.generated')} $stamp', style: const pw.TextStyle(fontSize: 8, color: _muted)),
            pw.Text('${context.pageNumber} / ${context.pagesCount}',
                style: const pw.TextStyle(fontSize: 8, color: _muted)),
          ],
        ),
      ),
      build: (context) => [
        /* الرأس: شريط الهوية والعنوان والفترة */
        pw.Container(
          padding: const pw.EdgeInsets.all(16),
          decoration: pw.BoxDecoration(
            color: _green,
            borderRadius: pw.BorderRadius.circular(10),
          ),
          child: pw.Row(
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(tr('app.title'),
                        style: const pw.TextStyle(fontSize: 11, color: PdfColors.white, fontWeight: pw.FontWeight.bold)),
                    pw.SizedBox(height: 2),
                    pw.Text(_bidi(doc.title),
                        style: const pw.TextStyle(fontSize: 20, color: PdfColors.white, fontWeight: pw.FontWeight.bold)),
                  ],
                ),
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(_bidi(doc.period), style: const pw.TextStyle(fontSize: 10, color: PdfColors.white)),
                  pw.SizedBox(height: 2),
                  pw.Text(_bidi(doc.vehicles), style: const pw.TextStyle(fontSize: 10, color: PdfColors.white)),
                ],
              ),
            ],
          ),
        ),
        pw.SizedBox(height: 14),

        /* الملخّص */
        pw.Row(
          children: [
            for (final (i, s) in doc.summary.indexed) ...[
              if (i > 0) pw.SizedBox(width: 8),
              pw.Expanded(
                child: pw.Container(
                  padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: _line),
                    borderRadius: pw.BorderRadius.circular(8),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(_bidi(s.$2), style: const pw.TextStyle(fontSize: 14, color: _ink, fontWeight: pw.FontWeight.bold)),
                      pw.Text(_bidi(s.$1), style: const pw.TextStyle(fontSize: 8.5, color: _muted)),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
        pw.SizedBox(height: 14),

        if (doc.rows.isEmpty)
          pw.Padding(
            padding: const pw.EdgeInsets.all(24),
            child: pw.Center(
              child: pw.Text(tr('rep.empty'), style: const pw.TextStyle(fontSize: 11, color: _muted)),
            ),
          )
        else
          pw.TableHelper.fromTextArray(
            headers: ordered(doc.columns),
            data: [for (final r in doc.rows) ordered(r)],
            border: null,
            headerDecoration: const pw.BoxDecoration(color: _ink),
            headerStyle: const pw.TextStyle(fontSize: 9, color: PdfColors.white, fontWeight: pw.FontWeight.bold),
            cellStyle: const pw.TextStyle(fontSize: 9, color: _ink),
            headerAlignment: pw.Alignment.center,
            cellAlignment: pw.Alignment.center,
            rowDecoration: const pw.BoxDecoration(
              border: pw.Border(bottom: pw.BorderSide(color: _line, width: 0.5)),
            ),
            oddRowDecoration: const pw.BoxDecoration(color: _zebra),
            cellPadding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            headerPadding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 7),
          ),
      ],
    ),
  );

  return pdf.save();
}
