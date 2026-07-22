import type { ParticipantImportResult } from '@/lib/participant-import-service';

interface Props {
  eventId: string;
  disabled?: boolean;
  onImported?: (result: ParticipantImportResult) => void;
}

export default function ParticipantExcelImport(_props: Props) {
  return null;
}
