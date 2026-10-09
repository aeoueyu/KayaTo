import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kayato_mobile/kayato_toast.dart';
import 'package:kayato_mobile/main.dart';

void main() {
  tearDown(kayaToast.dismissAll);

  testWidgets('shows and dismisses a success toast', (tester) async {
    await tester.pumpWidget(const KayaToApp());
    kayaToast.success('Task created');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('Task created'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle_outline_rounded), findsWidgets);

    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('Task created'), findsNothing);
  });

  test('controller limits the visible toast stack', () {
    final controller = KayaToastController(maxVisible: 2);
    controller.show('First');
    controller.show('Second');
    controller.show('Third');

    expect(controller.items.map((item) => item.title), ['Second', 'Third']);
    controller.dispose();
  });

  testWidgets('toast stack fits small portrait and landscape screens', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    tester.view.devicePixelRatio = 1;

    for (final size in [const Size(375, 667), const Size(667, 375)]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(const KayaToApp());
      for (var index = 0; index < 4; index++) {
        kayaToast.show(
          'Notification ${index + 1}',
          description:
              'A longer supporting message that must reflow without clipping.',
        );
      }
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      expect(tester.takeException(), isNull);
      kayaToast.dismissAll();
      await tester.pump();
    }
  });
}
