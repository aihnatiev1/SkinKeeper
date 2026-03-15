import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {

  override func scene(
    _ scene: UIScene,
    openURLContexts URLContexts: Set<UIOpenURLContext>
  ) {
    for context in URLContexts {
      print("SceneDelegate open url: \(context.url.absoluteString)")
      if let controller = window?.rootViewController as? FlutterViewController {
        let channel = FlutterMethodChannel(
          name: "app.skinkeeper.store/deep_link",
          binaryMessenger: controller.binaryMessenger
        )
        channel.invokeMethod("onLink", arguments: context.url.absoluteString)
      }
    }
    super.scene(scene, openURLContexts: URLContexts)
  }
}
