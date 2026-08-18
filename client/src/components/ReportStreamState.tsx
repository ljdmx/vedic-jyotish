import React from "react";
import type { AiOutputMode } from "@/lib/output-mode";
import type { StreamWaitState } from "@/lib/stream-status";
import { getReportReadingNote, getStreamingInkwellCopy, getStreamingStatusCopy } from "@/lib/stream-ui";

export function ReportStreamMeta({ waitState }: { waitState: StreamWaitState }) {
  return <span data-stream-state={waitState}>{getStreamingStatusCopy(waitState)}</span>;
}

export function ReportStreamInkwell({ waitState }: { waitState: StreamWaitState }) {
  return <span data-stream-inkwell={waitState}>{getStreamingInkwellCopy(waitState)}</span>;
}

export function ReportReadingNote({ interrupted, mode }: { interrupted: boolean; mode: AiOutputMode }) {
  return <>{getReportReadingNote(interrupted, mode)}</>;
}
