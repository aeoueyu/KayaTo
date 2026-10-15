import 'dart:async';
import 'dart:collection';
import 'dart:ui';

import 'package:flutter/material.dart';

enum KayaToastType { normal, success, error, warning, info, loading }

enum KayaToastPosition { top, bottom }

class KayaToastAction {
  const KayaToastAction({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;
}

@immutable
class KayaToastData {
  const KayaToastData({
    required this.id,
    required this.title,
    required this.type,
    this.description,
    this.duration,
    this.action,
  });

  final String id;
  final String title;
  final String? description;
  final KayaToastType type;
  final Duration? duration;
  final KayaToastAction? action;

  KayaToastData copyWith({
    String? title,
    String? description,
    KayaToastType? type,
    Duration? duration,
    KayaToastAction? action,
  }) {
    return KayaToastData(
      id: id,
      title: title ?? this.title,
      description: description ?? this.description,
      type: type ?? this.type,
      duration: duration ?? this.duration,
      action: action ?? this.action,
    );
  }
}

class KayaToastController extends ChangeNotifier {
  KayaToastController({this.maxVisible = 4});

  final int maxVisible;
  final List<KayaToastData> _items = [];
  int _nextId = 0;

  UnmodifiableListView<KayaToastData> get items => UnmodifiableListView(_items);

  String show(
    String title, {
    String? description,
    KayaToastType type = KayaToastType.normal,
    Duration? duration = const Duration(seconds: 4),
    KayaToastAction? action,
  }) {
    final id = 'toast-${_nextId++}';
    if (_items.length >= maxVisible) _items.removeAt(0);
    _items.add(
      KayaToastData(
        id: id,
        title: title,
        description: description,
        type: type,
        duration: duration,
        action: action,
      ),
    );
    notifyListeners();
    return id;
  }

  String success(String title, {String? description}) =>
      show(title, description: description, type: KayaToastType.success);

  String error(String title, {String? description}) => show(
    title,
    description: description,
    type: KayaToastType.error,
    duration: const Duration(seconds: 6),
  );

  String warning(String title, {String? description}) =>
      show(title, description: description, type: KayaToastType.warning);

  String info(String title, {String? description}) =>
      show(title, description: description, type: KayaToastType.info);

  void update(
    String id, {
    required String title,
    String? description,
    KayaToastType type = KayaToastType.normal,
    Duration duration = const Duration(seconds: 4),
  }) {
    final index = _items.indexWhere((item) => item.id == id);
    if (index == -1) return;
    _items[index] = KayaToastData(
      id: id,
      title: title,
      description: description,
      type: type,
      duration: duration,
      action: _items[index].action,
    );
    notifyListeners();
  }

  Future<T> promise<T>(
    Future<T> future, {
    required String loading,
    required String Function(T value) success,
    required String Function(Object error) error,
  }) async {
    final id = show(loading, type: KayaToastType.loading, duration: null);
    try {
      final result = await future;
      update(id, title: success(result), type: KayaToastType.success);
      return result;
    } catch (exception) {
      update(
        id,
        title: error(exception),
        type: KayaToastType.error,
        duration: const Duration(seconds: 6),
      );
      rethrow;
    }
  }

  void dismiss(String id) {
    _items.removeWhere((item) => item.id == id);
    notifyListeners();
  }

  void dismissAll() {
    _items.clear();
    notifyListeners();
  }
}

final kayaToast = KayaToastController();

class KayaToaster extends StatelessWidget {
  const KayaToaster({
    required this.child,
    this.controller,
    this.position = KayaToastPosition.top,
    super.key,
  });

  final Widget child;
  final KayaToastController? controller;
  final KayaToastPosition position;

  @override
  Widget build(BuildContext context) {
    final toastController = controller ?? kayaToast;
    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        AnimatedBuilder(
          animation: toastController,
          builder: (context, _) {
            final items = position == KayaToastPosition.top
                ? toastController.items
                : toastController.items.reversed;
            return IgnorePointer(
              ignoring: toastController.items.isEmpty,
              child: SafeArea(
                minimum: const EdgeInsets.all(12),
                child: Align(
                  alignment: position == KayaToastPosition.top
                      ? Alignment.topCenter
                      : Alignment.bottomCenter,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      maxWidth: 440,
                      maxHeight: MediaQuery.sizeOf(context).height * .82,
                    ),
                    child: SingleChildScrollView(
                      reverse: position == KayaToastPosition.bottom,
                      physics: const ClampingScrollPhysics(),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: position == KayaToastPosition.top
                            ? MainAxisAlignment.start
                            : MainAxisAlignment.end,
                        children: [
                          for (final item in items)
                            _ToastCard(
                              key: ValueKey(item.id),
                              data: item,
                              position: position,
                              onDismiss: () => toastController.dismiss(item.id),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _ToastCard extends StatefulWidget {
  const _ToastCard({
    required this.data,
    required this.position,
    required this.onDismiss,
    super.key,
  });

  final KayaToastData data;
  final KayaToastPosition position;
  final VoidCallback onDismiss;

  @override
  State<_ToastCard> createState() => _ToastCardState();
}

class _ToastCardState extends State<_ToastCard> {
  Timer? _timer;
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _visible = true);
    });
    _scheduleDismissal();
  }

  @override
  void didUpdateWidget(covariant _ToastCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data.type != widget.data.type ||
        oldWidget.data.duration != widget.data.duration) {
      _scheduleDismissal();
    }
  }

  void _scheduleDismissal() {
    _timer?.cancel();
    final duration = widget.data.duration;
    if (duration != null) _timer = Timer(duration, _dismiss);
  }

  Future<void> _dismiss() async {
    if (!_visible || !mounted) return;
    setState(() => _visible = false);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (!reduceMotion) {
      await Future<void>.delayed(const Duration(milliseconds: 150));
    }
    if (mounted) widget.onDismiss();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 220);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final presentation = _presentation(widget.data.type, colors);
    const dismissDirection = DismissDirection.endToStart;

    return AnimatedSlide(
      offset: _visible
          ? Offset.zero
          : Offset(0, widget.position == KayaToastPosition.top ? -.25 : .25),
      duration: duration,
      curve: Curves.easeOutCubic,
      child: AnimatedOpacity(
        opacity: _visible ? 1 : 0,
        duration: duration,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Dismissible(
            key: ValueKey('dismiss-${widget.data.id}'),
            direction: dismissDirection,
            onDismissed: (_) => widget.onDismiss(),
            child: Semantics(
              container: true,
              liveRegion: true,
              label:
                  '${presentation.semanticLabel}: ${widget.data.title}'
                  '${widget.data.description == null ? '' : '. ${widget.data.description}'}',
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: colors.surface.withValues(
                        alpha: theme.brightness == Brightness.dark ? .94 : .88,
                      ),
                      border: Border.all(
                        color: colors.outlineVariant.withValues(alpha: .82),
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(
                            alpha: theme.brightness == Brightness.dark
                                ? .36
                                : .12,
                          ),
                          blurRadius: 26,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: presentation.color.withValues(alpha: .14),
                              borderRadius: BorderRadius.circular(11),
                            ),
                            child: widget.data.type == KayaToastType.loading
                                ? Padding(
                                    padding: const EdgeInsets.all(9),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: presentation.color,
                                    ),
                                  )
                                : Icon(
                                    presentation.icon,
                                    size: 20,
                                    color: presentation.color,
                                  ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 1),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    widget.data.title,
                                    style: theme.textTheme.titleSmall?.copyWith(
                                      fontWeight: FontWeight.w700,
                                      color: colors.onSurface,
                                    ),
                                  ),
                                  if (widget.data.description != null) ...[
                                    const SizedBox(height: 3),
                                    Text(
                                      widget.data.description!,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            height: 1.4,
                                            color: colors.onSurfaceVariant,
                                          ),
                                    ),
                                  ],
                                  if (widget.data.action != null) ...[
                                    const SizedBox(height: 8),
                                    TextButton(
                                      onPressed: () {
                                        widget.data.action!.onPressed();
                                        _dismiss();
                                      },
                                      style: TextButton.styleFrom(
                                        minimumSize: const Size(44, 44),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 12,
                                        ),
                                        foregroundColor: presentation.color,
                                      ),
                                      child: Text(widget.data.action!.label),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          Semantics(
                            button: true,
                            label: 'Dismiss notification',
                            child: IconButton(
                              onPressed: _dismiss,
                              icon: const Icon(Icons.close_rounded, size: 19),
                              color: colors.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

_ToastPresentation _presentation(KayaToastType type, ColorScheme colors) {
  return switch (type) {
    KayaToastType.success => const _ToastPresentation(
      Icons.check_circle_outline_rounded,
      Color(0xFF2A9D8F),
      'Success',
    ),
    KayaToastType.error => _ToastPresentation(
      Icons.error_outline_rounded,
      colors.error,
      'Error',
    ),
    KayaToastType.warning => const _ToastPresentation(
      Icons.warning_amber_rounded,
      Color(0xFFFB8500),
      'Warning',
    ),
    KayaToastType.info => const _ToastPresentation(
      Icons.info_outline_rounded,
      Color(0xFF118AB2),
      'Information',
    ),
    KayaToastType.loading => _ToastPresentation(
      Icons.sync_rounded,
      colors.primary,
      'Loading',
    ),
    KayaToastType.normal => _ToastPresentation(
      Icons.notifications_none_rounded,
      colors.primary,
      'Notification',
    ),
  };
}

class _ToastPresentation {
  const _ToastPresentation(this.icon, this.color, this.semanticLabel);

  final IconData icon;
  final Color color;
  final String semanticLabel;
}
