import 'dart:typed_data';

import 'package:printing/printing.dart';

/// على الهاتف: نافذة المشاركة في النظام — واتساب، إيميل، حفظ، طباعة.
Future<void> savePdf(Uint8List bytes, String fileName) =>
    Printing.sharePdf(bytes: bytes, filename: fileName);
