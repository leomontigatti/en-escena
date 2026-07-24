import type {
  AccessTicket,
  ArcaServiceName,
  ITicketStoragePort,
} from "@arcasdk/core";

// Cache in-process del Ticket de Acceso (TA) de WSAA. ARCA rechaza logins
// repetidos y el TA vive ~12h, así que hay que reusarlo entre llamadas en vez de
// re-autenticar en cada request. El SDK consulta este puerto antes de firmar un
// nuevo TRA: si devolvemos un TA vigente, saltea el `loginCms`.
//
// A diferencia del `MemoryTicketStorage` del SDK (un Map estático global,
// compartido entre CUITs y difícil de aislar en tests), este cache es de
// instancia y decide la vigencia acá: `get` devuelve `null` cuando el TA venció,
// forzando la re-autenticación. Esa decisión de vigencia es lo que los tests
// ejercitan sin tocar la red.
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
