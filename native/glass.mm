// Public AppKit materials, clipped to the actual floating UI. No desktop
// capture, private selectors, or full-window vibrancy background.
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <CoreGraphics/CoreGraphics.h>
#import <objc/runtime.h>
#include <node_api.h>
#include <cmath>

@protocol GLUIGlass
@property CGFloat cornerRadius;
@property NSInteger style;
@property NSColor *tintColor;
@end

@interface GLUIMaterialPanel : NSPanel
@end
@implementation GLUIMaterialPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@interface GLUIMaterials : NSObject
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, NSView *> *surfaces;
@property(nonatomic, strong) NSView *canvas;
@property(nonatomic, strong) GLUIMaterialPanel *panel;
@property(nonatomic, weak) NSWindow *parent;
@end
@implementation GLUIMaterials
- (instancetype)initWithParent:(NSWindow *)parent {
  if ((self = [super init])) {
    self.parent = parent;
    self.surfaces = [NSMutableDictionary new];
    self.panel = [[GLUIMaterialPanel alloc] initWithContentRect:parent.frame
      styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
      backing:NSBackingStoreBuffered defer:NO];
    self.panel.releasedWhenClosed = NO;
    self.panel.opaque = NO;
    self.panel.backgroundColor = NSColor.clearColor;
    self.panel.hasShadow = NO;
    self.panel.ignoresMouseEvents = YES;
    self.panel.hidesOnDeactivate = NO;
    self.panel.excludedFromWindowsMenu = YES;
    self.panel.accessibilityHidden = YES;
    self.panel.collectionBehavior = parent.collectionBehavior;
    self.panel.level = parent.level;
    self.canvas = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, parent.frame.size.width, parent.frame.size.height)];
    self.canvas.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.canvas.accessibilityHidden = YES;
    self.panel.contentView = self.canvas;
    [parent addChildWindow:self.panel ordered:NSWindowBelow];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(parentClosing:)
      name:NSWindowWillCloseNotification object:parent];
  }
  return self;
}
- (void)parentClosing:(NSNotification *)notification {
  [self.parent removeChildWindow:self.panel];
  [self.panel orderOut:nil];
}
- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  [self.parent removeChildWindow:self.panel];
  [self.panel orderOut:nil];
}
@end

static char hostKey;
static double number(napi_env env, napi_value object, const char *key, double fallback = 0) {
  napi_value value;
  double result;
  if (napi_get_named_property(env, object, key, &value) != napi_ok ||
      napi_get_value_double(env, value, &result) != napi_ok || !std::isfinite(result)) return fallback;
  return result;
}

static napi_value update(napi_env env, napi_callback_info info) {
  napi_value args[3], result;
  size_t argc = 3, length = 0;
  void *handle = nullptr;
  bool dark = false, success = false, isBuffer = false, isArray = false;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 3 || ![NSThread isMainThread]) goto done;
  napi_is_buffer(env, args[0], &isBuffer);
  napi_is_array(env, args[1], &isArray);
  if (!isBuffer || !isArray) goto done;
  napi_get_buffer_info(env, args[0], &handle, &length);
  napi_get_value_bool(env, args[2], &dark);
  if (!handle || length < sizeof(void *)) goto done;
  @autoreleasepool {
    NSView *root = (__bridge NSView *)(*static_cast<void **>(handle));
    if (!root || !root.window) goto done;
    GLUIMaterials *host = objc_getAssociatedObject(root, &hostKey);
    if (!host) {
      // NSGlassEffectView in Chromium's own compositor can sample foreground
      // text and cover it. A click-through child ordered BELOW the foreground
      // provides a separate WindowServer backdrop with no feedback loop.
      host = [[GLUIMaterials alloc] initWithParent:root.window];
      objc_setAssociatedObject(root, &hostKey, host, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    NSRect screenFrame = [root.window convertRectToScreen:[root convertRect:root.bounds toView:nil]];
    if (!NSEqualRects(host.panel.frame, screenFrame)) [host.panel setFrame:screenFrame display:NO];
    NSAppearance *appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
    host.panel.appearance = appearance;
    NSView *canvas = host.canvas;
    uint32_t count = 0;
    napi_get_array_length(env, args[1], &count);
    NSMutableSet *live = [NSMutableSet new];
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    for (uint32_t i = 0; i < MIN(count, 32); i++) {
      napi_value rect;
      napi_get_element(env, args[1], i, &rect);
      NSNumber *key = @(number(env, rect, "id"));
      CGFloat x = number(env, rect, "x"), y = number(env, rect, "y");
      CGFloat w = number(env, rect, "width"), h = number(env, rect, "height");
      CGFloat radius = number(env, rect, "radius", 26);
      if (w < 1 || h < 1 || w > root.bounds.size.width + 2 || h > root.bounds.size.height + 2 ||
          std::abs(x) > 32768 || std::abs(y) > 32768 || radius < 0 || radius > 32768) continue;
      NSRect frame = NSMakeRect(x, canvas.isFlipped ? y : canvas.bounds.size.height - y - h, w, h);
      NSView *view = host.surfaces[key];
      if (!view) {
        Class glassClass = NSClassFromString(@"NSGlassEffectView");
        if (glassClass) {
          view = [[glassClass alloc] initWithFrame:frame];
          // Clear glass preserves the backdrop and the refracted perimeter.
          // Contrast is supplied once by the renderer's shared tint, rather
          // than stacking opaque fills on every intersecting piece of glass.
          [(id<GLUIGlass>)view setStyle:1];
          view.wantsLayer = YES;
        } else {
          NSVisualEffectView *frost = [[NSVisualEffectView alloc] initWithFrame:frame];
          frost.material = NSVisualEffectMaterialPopover;
          frost.blendingMode = NSVisualEffectBlendingModeBehindWindow;
          frost.state = NSVisualEffectStateActive;
          view = frost;
        }
        host.surfaces[key] = view;
      }
      view.frame = frame;
      view.appearance = appearance;
      view.alphaValue = MAX(0, MIN(1, number(env, rect, "opacity", 1)));
      if ([view respondsToSelector:@selector(setCornerRadius:)]) {
        [(id<GLUIGlass>)view setCornerRadius:radius];
        [(id<GLUIGlass>)view setTintColor:[NSColor colorWithCalibratedWhite:dark ? 10.0/255 : 253.0/255 alpha:dark ? .16 : .08]];
      } else {
        view.wantsLayer = YES;
        view.layer.cornerRadius = radius;
        view.layer.masksToBounds = YES;
      }
      [canvas addSubview:view positioned:NSWindowAbove relativeTo:nil];
      [live addObject:key];
    }
    for (NSNumber *key in host.surfaces.allKeys) {
      if (![live containsObject:key]) {
        [host.surfaces[key] removeFromSuperview];
        [host.surfaces removeObjectForKey:key];
      }
    }
    [CATransaction commit];
    if (root.window.visible && count > 0) {
      if (host.panel.parentWindow != root.window) [root.window addChildWindow:host.panel ordered:NSWindowBelow];
      if (!host.panel.visible) [host.panel orderWindow:NSWindowBelow relativeTo:root.window.windowNumber];
    } else [host.panel orderOut:nil];
    success = true;
  }
done:
  napi_get_boolean(env, success, &result);
  return result;
}

// Read-only integration diagnostics; never exposed to the renderer.
static napi_value inspect(napi_env env, napi_callback_info info) {
  napi_value arg, value; size_t argc = 1, length = 0; void *handle = nullptr; bool isBuffer = false;
  napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr);
  if (argc != 1 || ![NSThread isMainThread]) { napi_get_null(env, &value); return value; }
  napi_is_buffer(env, arg, &isBuffer);
  if (!isBuffer) { napi_get_null(env, &value); return value; }
  napi_get_buffer_info(env, arg, &handle, &length);
  if (!handle || length < sizeof(void *)) { napi_get_null(env, &value); return value; }
  NSView *root = (__bridge NSView *)(*static_cast<void **>(handle));
  GLUIMaterials *host = objc_getAssociatedObject(root, &hostKey);
  napi_create_object(env, &value);
  napi_value field;
  napi_get_boolean(env, host && host.panel != root.window && host.canvas.window == host.panel, &field);
  napi_set_named_property(env, value, "separateBackdrop", field);
  napi_get_boolean(env, host.panel.visible, &field);
  napi_set_named_property(env, value, "visible", field);
  napi_get_boolean(env, host.panel.ignoresMouseEvents, &field);
  napi_set_named_property(env, value, "ignoresMouseEvents", field);
  // NSApp.orderedWindows excludes utility panels. Inspect the WindowServer's
  // front-to-back IDs; no screen pixels or other applications' metadata leave here.
  NSArray<NSDictionary *> *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
  NSUInteger foregroundIndex = NSNotFound, backdropIndex = NSNotFound;
  for (NSUInteger i = 0; i < windows.count; i++) {
    NSInteger number = [windows[i][(__bridge NSString *)kCGWindowNumber] integerValue];
    if (number == root.window.windowNumber) foregroundIndex = i;
    if (number == host.panel.windowNumber) backdropIndex = i;
  }
  napi_get_boolean(env, foregroundIndex != NSNotFound && backdropIndex != NSNotFound && backdropIndex > foregroundIndex, &field);
  napi_set_named_property(env, value, "orderedBehindParent", field);
  NSRect expected = [root.window convertRectToScreen:[root convertRect:root.bounds toView:nil]];
  napi_get_boolean(env, NSEqualRects(host.panel.frame, expected), &field);
  napi_set_named_property(env, value, "alignedWithParent", field);
  napi_create_uint32(env, (uint32_t)host.surfaces.count, &field);
  napi_set_named_property(env, value, "surfaceCount", field);
  return value;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_value function;
  napi_create_function(env, "update", NAPI_AUTO_LENGTH, update, nullptr, &function);
  napi_set_named_property(env, exports, "update", function);
  napi_create_function(env, "inspect", NAPI_AUTO_LENGTH, inspect, nullptr, &function);
  napi_set_named_property(env, exports, "inspect", function);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
