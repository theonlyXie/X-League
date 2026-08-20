import { Venue } from '@/data/player';

export type VenueSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type VenueSubmission = {
  id: string;
  name: string;
  area: string;
  ownerName: string;
  status: VenueSubmissionStatus;
  submittedAt: number;
  reviewedAt?: number;
  rejectionReason?: string;
};

export type VenuesContextValue = {
  ready: boolean;
  submissions: VenueSubmission[];
  submitVenue: (name: string, area: string, ownerName: string) => Promise<VenueSubmission>;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
  playerVenues: Venue[];
  pendingSubmissions: VenueSubmission[];
  submissionForOwner: (ownerName: string) => VenueSubmission | null;
};
