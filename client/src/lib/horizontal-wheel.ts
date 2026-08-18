export function shouldRedirectWheelToHorizontalScroll(input: {
  scrollWidth: number;
  clientWidth: number;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
}) {
  if (input.scrollWidth <= input.clientWidth) return false;
  if (!input.shiftKey && Math.abs(input.deltaY) < Math.abs(input.deltaX)) return false;
  return input.deltaY !== 0;
}
