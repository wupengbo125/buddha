import { ulid } from 'ulid';
import { storageNamespace } from './brand';

const DEVICE_KEY = `${storageNamespace}:device-id`;

/** 首次访问生成随机设备 id 存 localStorage，之后复用。 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = ulid();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function deviceHeaders(): Record<string, string> {
  const id = getDeviceId();
  return id ? { 'X-Device-Id': id } : {};
}
