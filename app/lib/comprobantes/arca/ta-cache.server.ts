import type {
  AccessTicket,
  ArcaServiceName,
  ITicketStoragePort,
} from "@arcasdk/core";

// In-process cache of WSAA's Access Ticket (TA). ARCA rejects repeated logins
// and the TA lives ~12 h, so it has to be reused across calls instead of
// re-authenticating on every request. The SDK consults this port before signing
// a new TRA: if we return a TA still in force, it skips the `loginCms`.
//
// Unlike the SDK's `MemoryTicketStorage` (a global static Map, shared across
// CUITs and hard to isolate in tests), this cache is per instance and decides
// validity here: `get` returns `null` once the TA has expired, forcing
// re-authentication. That validity decision is what the tests exercise without
// touching the network.
export class InMemoryTaCache implements ITicketStoragePort {
  private readonly tickets = new Map<ArcaServiceName, AccessTicket>();

  async save(
    ticket: AccessTicket,
    serviceName: ArcaServiceName,
  ): Promise<void> {
    this.tickets.set(serviceName, ticket);
  }

  async get(serviceName: ArcaServiceName): Promise<AccessTicket | null> {
    const ticket = this.tickets.get(serviceName);

    if (!ticket) {
      return null;
    }

    if (ticket.isExpired()) {
      this.tickets.delete(serviceName);
      return null;
    }

    return ticket;
  }

  async delete(serviceName: ArcaServiceName): Promise<void> {
    this.tickets.delete(serviceName);
  }
}
