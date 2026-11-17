let imageSupport = false;

export function setImageSupport(value: boolean): void {
  imageSupport = value;
}

export function imageSupportEnabled(): boolean {
  return imageSupport;
}
