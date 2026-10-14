import { api } from './api';

function decodeVapidKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export const browserPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function browserPushState() {
  const { data } = await api.get('/push/config');
  return { ...data, permission: browserPushSupported() ? Notification.permission : 'unsupported' };
}

export async function enableBrowserPush(publicKey) {
  if (!browserPushSupported()) throw new Error('This browser does not support push notifications.');
  if (!publicKey) throw new Error('Browser push is not configured on the server.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Browser notifications are blocked. Allow them in your browser site settings.' : 'Notification permission was not granted.');
  const registration = await navigator.serviceWorker.register('/kayato-sw.js');
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
  await api.post('/push/web', { subscription: subscription.toJSON() });
  return subscription;
}

export async function disableBrowserPush() {
  if (!browserPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/kayato-sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.delete('/push/web', { data: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  } else await api.delete('/push/web');
}
