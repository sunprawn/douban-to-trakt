export interface Movie {
  id: number;
  title: string;
  rating: number | null;
  imdbId: string | null;
  rateDate: string;
  doubanLink: string;
  syncedAt: string | null;
}
