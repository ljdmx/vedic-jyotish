export type PrashnaLocationDraft = {
  place: string;
  latitude: string;
  longitude: string;
  timezoneOffset: string;
};

export type PrashnaLocationPayload = {
  name: "Prashna";
  place: string;
  latitude: number;
  longitude: number;
  timezoneOffset: number;
  timeAccuracy: "当前起盘";
};

export function buildPrashnaLocation(draft: PrashnaLocationDraft): { payload: PrashnaLocationPayload | null; error: string | null } {
  const place = draft.place.trim();
  const latitude = Number(draft.latitude);
  const longitude = Number(draft.longitude);
  const timezoneOffset = Number(draft.timezoneOffset);

  if (!place) return { payload: null, error: "请填写本次起盘地点名称" };
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { payload: null, error: "请填写 -90 至 90 之间的有效纬度" };
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { payload: null, error: "请填写 -180 至 180 之间的有效经度" };
  if (!Number.isFinite(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) return { payload: null, error: "请填写 -720 至 840 分钟之间的有效时区" };

  return {
    payload: { name: "Prashna", place, latitude, longitude, timezoneOffset, timeAccuracy: "当前起盘" },
    error: null,
  };
}
