import Foundation

public struct MobileGatewayConfig: Codable, Sendable {
    public let enabled: Bool
    public let roomIds: [String]
    public init(enabled: Bool, roomIds: [String]) { self.enabled = enabled; self.roomIds = roomIds }
}
public struct PairedMobileDevice: Codable, Sendable {
    public let id, name, kind, publicKey: String
    public init(id: String, name: String, kind: String, publicKey: String) { self.id = id; self.name = name; self.kind = kind; self.publicKey = publicKey }
}
public struct MobileGatewayError: Error { public let status: Int }
private final class NoMobileRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

public protocol MacMobileGateway: Sendable {
    func devices() async throws -> [PairedMobileDevice]
    func revocations(after: Int64) async throws -> [MobileRevocation]
    func snapshot(deviceId: String) async throws -> Data
    func submit(_ envelope: SignedEnvelope) async throws -> Data
}

/// Native only. Never hand this client or its credential to JavaScript or CloudKit.
public final class NativeMobileGateway: MacMobileGateway, Sendable {
    private let base: URL
    private let credential: String
    private let session: URLSession
    public init(base: URL, credential: String) throws {
        guard base.scheme == "http", ["127.0.0.1", "::1", "[::1]"].contains(base.host ?? ""),
              base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
              base.path.isEmpty || base.path == "/", credential.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw MobileProtocolError.malformed }
        self.base = base; self.credential = credential
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 20
        configuration.httpShouldSetCookies = false
        self.session = URLSession(configuration: configuration, delegate: NoMobileRedirects(), delegateQueue: nil)
    }
    deinit { session.invalidateAndCancel() }
    func request(path: String, method: String, body: Data? = nil, localAction: Bool = false) throws -> URLRequest {
        guard path.range(of: "^(config|devices|commands|revocations/[0-9]{1,16}|snapshot/[A-Za-z0-9_-]{1,128}|devices/[A-Za-z0-9_-]{1,128}/revoke)$", options: .regularExpression) != nil,
              ["GET", "POST"].contains(method), (body?.count ?? 0) <= 32768,
              let url = URL(string: "/api/mobile/" + path, relativeTo: base)?.absoluteURL else { throw MobileProtocolError.malformed }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method; request.httpBody = body
        request.setValue("1", forHTTPHeaderField: "X-ShuaCrew")
        request.setValue(credential, forHTTPHeaderField: "X-ShuaCrew-Mobile-Bridge")
        if localAction { request.setValue("1", forHTTPHeaderField: "X-ShuaCrew-Mobile-Local-Action") }
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return request
    }
    private func send(_ path: String, method: String = "GET", body: Data? = nil, local: Bool = false) async throws -> Data {
        let request = try request(path: path, method: method, body: body, localAction: local)
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw MobileProtocolError.malformed }
        guard (200..<300).contains(http.statusCode) else { throw MobileGatewayError(status: http.statusCode) }
        var data = Data()
        for try await byte in bytes {
            guard data.count < 1048576 else { throw MobileProtocolError.tooLarge }
            data.append(byte)
        }
        return data
    }
    public func configuration() async throws -> MobileGatewayConfig { try JSONDecoder().decode(MobileGatewayConfig.self, from: await send("config")) }
    public func configure(_ value: MobileGatewayConfig) async throws {
        _ = try await send("config", method: "POST", body: JSONEncoder().encode(value), local: true)
    }
    public func devices() async throws -> [PairedMobileDevice] { try JSONDecoder().decode([PairedMobileDevice].self, from: await send("devices")) }
    public func revocations(after: Int64) async throws -> [MobileRevocation] {
        guard after >= 0, after <= 9007199254740991 else { throw MobileProtocolError.malformed }
        return try JSONDecoder().decode([MobileRevocation].self, from: await send("revocations/\(after)"))
    }
    public func pair(_ device: PairedMobileDevice) async throws { _ = try await send("devices", method: "POST", body: JSONEncoder().encode(device), local: true) }
    public func revoke(_ id: String) async throws { _ = try await send("devices/" + id + "/revoke", method: "POST", body: Data("{}".utf8), local: true) }
    public func snapshot(deviceId: String) async throws -> Data { try await send("snapshot/" + deviceId) }
    public func submit(_ envelope: SignedEnvelope) async throws -> Data { try await send("commands", method: "POST", body: JSONEncoder().encode(envelope)) }
}
