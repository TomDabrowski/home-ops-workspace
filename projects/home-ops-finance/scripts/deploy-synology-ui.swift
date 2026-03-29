import AppKit
import Foundation

final class DeployWindowController: NSWindowController, NSWindowDelegate {
  private let rootPath: String
  private let deployScriptPath: String
  private let localEnvPath: String

  private var deployProcess: Process?
  private var outputPipe: Pipe?
  private var outputBuffer = ""
  private var usedSavedPassword = false

  private let statusLabel = NSTextField(labelWithString: "Bereite Deploy vor …")
  private let progressIndicator = NSProgressIndicator()
  private let logScrollView = NSScrollView()
  private let logView = NSTextView(frame: NSRect(x: 0, y: 0, width: 720, height: 360))
  private let cancelButton = NSButton(title: "Abbrechen", target: nil, action: nil)
  private let closeButton = NSButton(title: "Schließen", target: nil, action: nil)

  private var deployEnv: [String: String] = [:]
  private var hostLabel = ""
  private var keychainService = "Home Ops Finance Deploy"
  private var keychainAccount = ""

  init(rootPath: String) {
    self.rootPath = rootPath
    self.deployScriptPath = "\(rootPath)/scripts/deploy-synology.sh"
    self.localEnvPath = "\(rootPath)/.deploy.local.env"

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 760, height: 560),
      styleMask: [.titled, .closable, .miniaturizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Home Ops Finance Deploy"
    window.isReleasedWhenClosed = false
    super.init(window: window)
    window.delegate = self
    setupUI()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func start() {
    do {
      deployEnv = try loadDeployEnv()
      hostLabel = "\(deployEnv["DEPLOY_USER"] ?? "?")@\(deployEnv["DEPLOY_HOST"] ?? "?")"
      keychainService = deployEnv["DEPLOY_KEYCHAIN_SERVICE"] ?? keychainService
      keychainAccount = deployEnv["DEPLOY_KEYCHAIN_ACCOUNT"] ?? hostLabel
      appendLog("Home Ops Finance Deploy")
      appendLog("Ziel: \(hostLabel)")
      appendLog("")
      beginDeploy()
    } catch {
      finish(status: "Deploy-Konfiguration fehlt oder ist unvollständig.", success: false)
      appendLog(error.localizedDescription)
    }
  }

  func windowWillClose(_ notification: Notification) {
    if let process = deployProcess, process.isRunning {
      process.terminate()
    }
    NSApp.terminate(nil)
  }

  private func setupUI() {
    guard let contentView = window?.contentView else { return }

    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 14
    stack.translatesAutoresizingMaskIntoConstraints = false

    statusLabel.font = NSFont.systemFont(ofSize: 14, weight: .semibold)
    statusLabel.lineBreakMode = .byWordWrapping
    statusLabel.maximumNumberOfLines = 2

    progressIndicator.style = .bar
    progressIndicator.isIndeterminate = true
    progressIndicator.controlSize = .regular
    progressIndicator.startAnimation(nil)

    logScrollView.borderType = .bezelBorder
    logScrollView.hasVerticalScroller = true
    logScrollView.hasHorizontalScroller = false
    logScrollView.autohidesScrollers = true
    logScrollView.translatesAutoresizingMaskIntoConstraints = false

    logView.isEditable = false
    logView.isSelectable = true
    logView.isRichText = false
    logView.importsGraphics = false
    logView.usesFindBar = true
    logView.isVerticallyResizable = true
    logView.isHorizontallyResizable = false
    logView.autoresizingMask = [.width]
    logView.textContainerInset = NSSize(width: 10, height: 10)
    logView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
    logView.backgroundColor = NSColor(calibratedWhite: 0.11, alpha: 1)
    logView.textColor = NSColor(calibratedWhite: 0.92, alpha: 1)
    logView.textContainer?.containerSize = NSSize(width: 720, height: CGFloat.greatestFiniteMagnitude)
    logView.textContainer?.widthTracksTextView = true
    logScrollView.documentView = logView

    let buttonRow = NSStackView()
    buttonRow.orientation = .horizontal
    buttonRow.alignment = .centerY
    buttonRow.spacing = 10

    cancelButton.target = self
    cancelButton.action = #selector(cancelDeploy)
    cancelButton.bezelStyle = .rounded

    closeButton.target = self
    closeButton.action = #selector(closeWindow)
    closeButton.bezelStyle = .rounded
    closeButton.isEnabled = false

    buttonRow.addArrangedSubview(cancelButton)
    buttonRow.addArrangedSubview(closeButton)

    stack.addArrangedSubview(statusLabel)
    stack.addArrangedSubview(progressIndicator)
    stack.addArrangedSubview(logScrollView)
    stack.addArrangedSubview(buttonRow)

    contentView.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 20),
      stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -20),
      progressIndicator.widthAnchor.constraint(equalTo: stack.widthAnchor),
      logScrollView.widthAnchor.constraint(equalTo: stack.widthAnchor),
      logScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 360),
    ])
  }

  private func loadDeployEnv() throws -> [String: String] {
    guard FileManager.default.fileExists(atPath: localEnvPath) else {
      throw NSError(domain: "DeployUI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Es fehlt \(localEnvPath)."])
    }

    let contents = try String(contentsOfFile: localEnvPath, encoding: .utf8)
    var values: [String: String] = [:]

    for rawLine in contents.split(whereSeparator: \.isNewline) {
      let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
      if line.isEmpty || line.hasPrefix("#") { continue }
      guard let separatorIndex = line.firstIndex(of: "=") else { continue }
      let key = String(line[..<separatorIndex]).trimmingCharacters(in: .whitespaces)
      var value = String(line[line.index(after: separatorIndex)...]).trimmingCharacters(in: .whitespaces)
      if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
        value.removeFirst()
        value.removeLast()
      }
      values[key] = value
    }

    guard values["DEPLOY_HOST"]?.isEmpty == false,
          values["DEPLOY_USER"]?.isEmpty == false,
          values["DEPLOY_SSH_IDENTITY"]?.isEmpty == false else {
      throw NSError(domain: "DeployUI", code: 2, userInfo: [NSLocalizedDescriptionKey: "In \(localEnvPath) fehlen DEPLOY_HOST, DEPLOY_USER oder DEPLOY_SSH_IDENTITY."])
    }

    return values
  }

  private func beginDeploy() {
    if let saved = readPasswordFromKeychain(), !saved.isEmpty {
      usedSavedPassword = true
      appendLog("Verwende gespeichertes Passwort aus dem macOS Schlüsselbund.")
      runDeploy(password: saved)
      return
    }

    guard let prompt = promptForPassword() else {
      finish(status: "Deploy abgebrochen.", success: false)
      return
    }

    if prompt.saveToKeychain {
      _ = savePasswordToKeychain(prompt.password)
    }
    usedSavedPassword = false
    runDeploy(password: prompt.password)
  }

  private func runDeploy(password: String) {
    statusLabel.stringValue = "Deploy läuft für \(hostLabel) …"
    progressIndicator.startAnimation(nil)
    cancelButton.isEnabled = true
    closeButton.isEnabled = false

    let process = Process()
    let pipe = Pipe()

    process.executableURL = URL(fileURLWithPath: deployScriptPath)
    process.currentDirectoryURL = URL(fileURLWithPath: rootPath)
    process.standardOutput = pipe
    process.standardError = pipe

    var env = ProcessInfo.processInfo.environment
    deployEnv.forEach { env[$0.key] = $0.value }
    env["DEPLOY_REMOTE_SUDO_PASSWORD"] = password
    env["COPYFILE_DISABLE"] = "1"
    process.environment = env

    outputPipe = pipe
    deployProcess = process

    pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty, let chunk = String(data: data, encoding: .utf8) else { return }
      DispatchQueue.main.async {
        self?.appendLog(chunk)
        self?.updateStatus(from: chunk)
      }
    }

    process.terminationHandler = { [weak self] proc in
      DispatchQueue.main.async {
        self?.outputPipe?.fileHandleForReading.readabilityHandler = nil
        self?.outputPipe = nil
        self?.deployProcess = nil

        if proc.terminationStatus == 0 {
          self?.finish(status: "Deploy erfolgreich abgeschlossen.", success: true)
          return
        }

        if self?.usedSavedPassword == true {
          self?.appendLog("\nGespeichertes Passwort war offenbar nicht mehr gültig. Bitte erneut eingeben.\n")
          self?.usedSavedPassword = false
          if let retry = self?.promptForPassword() {
            if retry.saveToKeychain {
              _ = self?.savePasswordToKeychain(retry.password)
            }
            self?.runDeploy(password: retry.password)
            return
          }
        }

        self?.finish(status: "Deploy fehlgeschlagen.", success: false)
      }
    }

    do {
      try process.run()
    } catch {
      finish(status: "Deploy konnte nicht gestartet werden.", success: false)
      appendLog("\(error.localizedDescription)\n")
    }
  }

  private func updateStatus(from chunk: String) {
    if chunk.contains("Syncing project files") {
      statusLabel.stringValue = "Projektdateien werden synchronisiert …"
    } else if chunk.contains("Building image and restarting container") {
      statusLabel.stringValue = "Container wird gebaut und neu gestartet …"
    } else if chunk.contains("Deployment finished.") {
      statusLabel.stringValue = "Deploy erfolgreich abgeschlossen."
    } else if chunk.localizedCaseInsensitiveContains("failed") || chunk.contains("Deploy fehlgeschlagen") {
      statusLabel.stringValue = "Deploy fehlgeschlagen."
    }
  }

  private func finish(status: String, success: Bool) {
    statusLabel.stringValue = status
    progressIndicator.stopAnimation(nil)
    cancelButton.isEnabled = false
    closeButton.isEnabled = true
    if success {
      NSApp.requestUserAttention(.informationalRequest)
    } else {
      NSSound.beep()
      NSApp.requestUserAttention(.criticalRequest)
    }
  }

  private func appendLog(_ text: String) {
    outputBuffer += text
    logView.string = outputBuffer
    logView.layoutManager?.ensureLayout(for: logView.textContainer!)
    let contentHeight = max(logView.bounds.height, logView.layoutManager?.usedRect(for: logView.textContainer!).height ?? 0)
    logView.frame.size.height = contentHeight + 24
    logView.scrollToEndOfDocument(nil)
  }

  private func readPasswordFromKeychain() -> String? {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    process.arguments = ["find-generic-password", "-a", keychainAccount, "-s", keychainService, "-w"]
    process.standardOutput = pipe
    process.standardError = Pipe()
    do {
      try process.run()
      process.waitUntilExit()
      guard process.terminationStatus == 0 else { return nil }
      let data = pipe.fileHandleForReading.readDataToEndOfFile()
      return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    } catch {
      return nil
    }
  }

  private func savePasswordToKeychain(_ password: String) -> Bool {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    process.arguments = ["add-generic-password", "-U", "-a", keychainAccount, "-s", keychainService, "-w", password]
    process.standardOutput = Pipe()
    process.standardError = Pipe()
    do {
      try process.run()
      process.waitUntilExit()
      return process.terminationStatus == 0
    } catch {
      return false
    }
  }

  private func promptForPassword() -> (password: String, saveToKeychain: Bool)? {
    let alert = NSAlert()
    alert.messageText = "Synology sudo-Passwort"
    alert.informativeText = "Bitte das sudo-Passwort für \(hostLabel) eingeben."
    alert.alertStyle = .informational
    alert.addButton(withTitle: "Deploy starten")
    alert.addButton(withTitle: "Abbrechen")

    let container = NSView(frame: NSRect(x: 0, y: 0, width: 320, height: 58))
    let passwordField = NSSecureTextField(frame: NSRect(x: 0, y: 28, width: 320, height: 24))
    let saveCheckbox = NSButton(checkboxWithTitle: "Im macOS Schlüsselbund speichern", target: nil, action: nil)
    saveCheckbox.frame = NSRect(x: 0, y: 0, width: 320, height: 22)
    saveCheckbox.state = .on
    container.addSubview(passwordField)
    container.addSubview(saveCheckbox)
    alert.accessoryView = container

    let response = alert.runModal()
    guard response == .alertFirstButtonReturn else { return nil }
    let password = passwordField.stringValue
    guard !password.isEmpty else { return nil }
    return (password, saveCheckbox.state == .on)
  }

  @objc private func cancelDeploy() {
    guard let process = deployProcess, process.isRunning else { return }
    appendLog("\nDeploy wird abgebrochen …\n")
    process.terminate()
    finish(status: "Deploy abgebrochen.", success: false)
  }

  @objc private func closeWindow() {
    window?.close()
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  private let rootPath: String
  private var controller: DeployWindowController?

  init(rootPath: String) {
    self.rootPath = rootPath
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let controller = DeployWindowController(rootPath: rootPath)
    self.controller = controller
    controller.showWindow(nil)
    controller.window?.center()
    NSApp.activate(ignoringOtherApps: true)
    controller.start()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

let executableURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
let inferredRootPath = executableURL
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .appendingPathComponent("Documents/repos/finance/projects/home-ops-finance")
  .path
let rootPath = CommandLine.arguments.dropFirst().first ?? ProcessInfo.processInfo.environment["HOME_OPS_FINANCE_ROOT"] ?? inferredRootPath
let application = NSApplication.shared
let delegate = AppDelegate(rootPath: rootPath)
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
