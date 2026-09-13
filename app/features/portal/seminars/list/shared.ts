/**
 * The gallery reads a poster and nothing else: the banner, the instructor, the
 * moment and how many people the academy has registered. Everything a card once
 * carried — the chips, the closed reason, the registration dialog — moved to
 * the seminar detail (`../detail/`), which is why this file holds no intent, no
 * schema and no picker.
 */
export type PortalSeminarCard = {
  id: string;
  instructorName: string;
  instructorPictureUrl: string | null;
  scheduledDate: string;
  startTime: string;
  /** The academy's own **active** inscriptions, the only count the poster
   * shows. The seminar's own occupancy is never said here. */
  inscriptionCount: number;
};

export type PortalSeminarsListLoaderData = {
  hasActiveEvent: boolean;
  seminars: PortalSeminarCard[];
};
