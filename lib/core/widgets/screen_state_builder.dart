import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../theme.dart';
import '../../widgets/shared_ui.dart';

/// Renders an [AsyncValue] across loading/error/empty/data states with
/// sensible defaults. Removes the 20-line `.when(...)` boilerplate that
/// repeats across every data-driven screen.
///
/// Minimum usage:
/// ```
/// ScreenStateBuilder<List<Item>>(
///   state: ref.watch(itemsProvider),
///   builder: (items) => ItemList(items),
/// )
/// ```
///
/// Add [isEmpty] + [emptyTitle] to get an EmptyState when the list is empty.
/// Add [onRetry] to get a Retry button in the default error state.
/// Any of [loading], [errorBuilder], [empty] overrides the default for that
/// state — use them for screens with bespoke loading skeletons.
class ScreenStateBuilder<T> extends StatelessWidget {
  final AsyncValue<T> state;
  final Widget Function(T data) builder;

  final bool Function(T data)? isEmpty;

  final Widget? loading;
  final Widget Function(Object error, StackTrace? st)? errorBuilder;
  final Widget? empty;

  final VoidCallback? onRetry;
  final IconData emptyIcon;
  final String? emptyTitle;
  final String? emptySubtitle;
  final Widget? emptyAction;

  const ScreenStateBuilder({
    super.key,
    required this.state,
    required this.builder,
    this.isEmpty,
    this.loading,
    this.errorBuilder,
    this.empty,
    this.onRetry,
    this.emptyIcon = Icons.inbox_outlined,
    this.emptyTitle,
    this.emptySubtitle,
    this.emptyAction,
  });

  @override
  Widget build(BuildContext context) {
    return state.when(
      loading: () => loading ?? _defaultLoading(),
      error: (e, st) =>
          errorBuilder?.call(e, st) ?? _defaultError(context, e),
      data: (data) {
        if (isEmpty?.call(data) == true) {
          return empty ?? _defaultEmpty();
        }
        return builder(data);
      },
    );
  }

  Widget _defaultLoading() => const Center(
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: AppTheme.primary,
        ),
      );

  Widget _defaultError(BuildContext context, Object e) {
    return EmptyState(
      icon: Icons.cloud_off_rounded,
      title: friendlyError(e),
      action: onRetry == null
          ? null
          : FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Retry'),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                    horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
    );
  }

  Widget _defaultEmpty() => EmptyState(
        icon: emptyIcon,
        title: emptyTitle ?? 'Nothing here yet',
        subtitle: emptySubtitle,
        action: emptyAction,
      );
}

/// Sliver variant of [ScreenStateBuilder] for screens built on CustomScrollView.
/// Each state returns a sliver so the builder slots directly into a slivers list.
///
/// [loadingSliver] defaults to the standard spinner wrapped in SliverFillRemaining.
/// Pass a skeleton SliverList (e.g. ShimmerCards) when you want a richer loader.
class SliverScreenStateBuilder<T> extends StatelessWidget {
  final AsyncValue<T> state;
  final Widget Function(T data) sliverBuilder;

  final bool Function(T data)? isEmpty;

  final Widget? loadingSliver;
  final Widget Function(Object error, StackTrace? st)? errorBuilder;
  final Widget? empty;

  final VoidCallback? onRetry;
  final IconData emptyIcon;
  final String? emptyTitle;
  final String? emptySubtitle;
  final Widget? emptyAction;

  const SliverScreenStateBuilder({
    super.key,
    required this.state,
    required this.sliverBuilder,
    this.isEmpty,
    this.loadingSliver,
    this.errorBuilder,
    this.empty,
    this.onRetry,
    this.emptyIcon = Icons.inbox_outlined,
    this.emptyTitle,
    this.emptySubtitle,
    this.emptyAction,
  });

  @override
  Widget build(BuildContext context) {
    return state.when(
      loading: () => loadingSliver ?? _defaultLoadingSliver(),
      error: (e, st) => SliverFillRemaining(
        hasScrollBody: false,
        child: errorBuilder?.call(e, st) ?? _defaultError(context, e),
      ),
      data: (data) {
        if (isEmpty?.call(data) == true) {
          return SliverFillRemaining(
            hasScrollBody: false,
            child: empty ?? _defaultEmpty(),
          );
        }
        return sliverBuilder(data);
      },
    );
  }

  Widget _defaultLoadingSliver() => const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppTheme.primary,
          ),
        ),
      );

  Widget _defaultError(BuildContext context, Object e) {
    return EmptyState(
      icon: Icons.cloud_off_rounded,
      title: friendlyError(e),
      action: onRetry == null
          ? null
          : FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Retry'),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                    horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
    );
  }

  Widget _defaultEmpty() => EmptyState(
        icon: emptyIcon,
        title: emptyTitle ?? 'Nothing here yet',
        subtitle: emptySubtitle,
        action: emptyAction,
      );
}
