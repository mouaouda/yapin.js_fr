const TOPIC = 'yapper-e2ee';

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function webcrypto() {
  return globalThis.crypto?.subtle ? globalThis.crypto : (await import('node:crypto')).webcrypto;
}

/**
 * The bot's half of the Yapin’ app's key handoff for end-to-end encrypted calls. Our P-256 public
 * key goes in the participant attribute `e2ee`; everyone who has one gets our media key over the
 * data channel (topic yapper-e2ee), sealed with AES-GCM under the ECDH secret the two of us share
 * and bound to "<from>|<to>|<index>". The bot hears nobody, so it never needs anyone's key back,
 * only to answer when someone sends theirs (they may have missed ours).
 */
export async function handOutVoiceKey(room, mediaKey) {
  const crypto = await webcrypto();
  const subtle = crypto.subtle;
  const me = room.localParticipant.identity;
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const myPub = b64(await subtle.exportKey('raw', pair.publicKey));
  const shared = new Map();
  const sent = new Map();
  let stopped = false;

  const sendTo = async (participant, pub) => {
    const theirPub = participant?.attributes?.e2ee || pub;
    if (stopped || !theirPub || participant.identity === me || sent.get(participant.identity) === theirPub) return;
    sent.set(participant.identity, theirPub);
    try {
      let key = shared.get(theirPub);
      if (!key) {
        const their = await subtle.importKey('raw', unb64(theirPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        key = await subtle.deriveKey({ name: 'ECDH', public: their }, pair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        shared.set(theirPub, key);
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const additionalData = new TextEncoder().encode(`${me}|${participant.identity}|0`);
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, mediaKey);
      const message = JSON.stringify({ i: 0, iv: b64(iv), ct: b64(ct), k: myPub });
      await room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
        topic: TOPIC,
        destination_identities: [participant.identity],
      });
    } catch {
      // Muted by a moderator (no data permission) or a bad key: try again on the next change.
      sent.delete(participant.identity);
    }
  };

  const onPeer = (participant) => void sendTo(participant);
  const onAttributes = (_changed, participant) => void sendTo(participant);
  const onData = (payload, who, _kind, topic) => {
    if (topic !== TOPIC || !who) return;
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));
      if (typeof message.k === 'string') {
        sent.delete(who.identity);
        void sendTo(who, message.k);
      }
    } catch {
      // not ours
    }
  };

  room.on('participantConnected', onPeer).on('participantAttributesChanged', onAttributes).on('dataReceived', onData);
  await room.localParticipant.setAttributes({ e2ee: myPub });
  for (const participant of room.remoteParticipants.values()) void sendTo(participant);

  return {
    stop() {
      stopped = true;
      room.off('participantConnected', onPeer).off('participantAttributesChanged', onAttributes).off('dataReceived', onData);
    },
  };
}
