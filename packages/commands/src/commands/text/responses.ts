import {
  BailianError,
  ExitCode,
  type ResponsesResponse,
  type ResponsesStreamEvent,
} from "bailian-cli-core";

export interface ResponsesStreamUpdate {
  delta: string;
  completed: boolean;
}

export function extractResponsesText(response: ResponsesResponse): string {
  return response.output
    .filter((outputItem) => outputItem.type === "message")
    .flatMap((outputItem) => outputItem.content ?? [])
    .filter((contentItem) => contentItem.type === "output_text")
    .map((contentItem) => contentItem.text ?? "")
    .join("");
}

export function extractResponsesStreamDelta(event: ResponsesStreamEvent): string {
  return event.type === "response.output_text.delta" ? (event.delta ?? "") : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringProperty(record: Record<string, unknown> | undefined, property: string) {
  const value = record?.[property];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function responsesErrorMessage(event: ResponsesStreamEvent): string | undefined {
  const response = asRecord(event.response);
  const responseError = asRecord(response?.error);
  const eventError = asRecord(event.error);
  return (
    stringProperty(responseError, "message") ??
    stringProperty(eventError, "message") ??
    stringProperty(event, "message")
  );
}

export function inspectResponsesStreamEvent(event: ResponsesStreamEvent): ResponsesStreamUpdate {
  if (event.type === "response.failed" || event.type === "error") {
    throw new BailianError(responsesErrorMessage(event) ?? "Response failed.", ExitCode.GENERAL);
  }

  if (event.type === "response.incomplete") {
    const response = asRecord(event.response);
    const incompleteDetails = asRecord(response?.incomplete_details);
    const reason = stringProperty(incompleteDetails, "reason");
    throw new BailianError(
      responsesErrorMessage(event) ??
        (reason ? `Response incomplete: ${reason}` : "Response incomplete."),
      ExitCode.GENERAL,
    );
  }

  return {
    delta: extractResponsesStreamDelta(event),
    completed: event.type === "response.completed",
  };
}

export function assertResponsesStreamCompleted(completed: boolean): void {
  if (completed) return;
  throw new BailianError(
    "Stream disconnected before completion: stream closed before response.completed.",
    ExitCode.GENERAL,
  );
}
