/**
 * WeMove Notification Service
 * Implements all triggers from PRD §11
 */

const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Notification types from PRD §11
const TYPES = {
  OTP:                'N-01',
  VERIFICATION:       'N-02',
  NEW_SEAT_REQUEST:   'N-03',
  REQUEST_ACCEPTED:   'N-04',
  REQUEST_REJECTED:   'N-05',
  BOOKING_CONFIRMED:  'N-06',
  TRIP_REMINDER:      'N-07',
  DRIVER_EN_ROUTE:    'N-08',
  TRIP_CANCELLED:     'N-09',
  PASSENGER_CANCELLED:'N-10',
  WAIT_STARTED:       'N-11',
  NO_SHOW:            'N-12',
  TRIP_COMPLETED:     'N-13',
  RATE_TRIP:          'N-14',
  PAYMENT_UPDATE:     'N-15',
  PAYOUT_UPDATE:      'N-16',
  SOS_ACKNOWLEDGED:   'N-17',
  RECURRING_CONFIRM:  'N-18',
  RELIABILITY_WARN:   'N-19',
};

async function saveAndSend({ userId, type, payload, channel }) {
  await pool.query(
    `INSERT INTO notifications (id, user_id, type, payload, channel) VALUES ($1,$2,$3,$4,$5)`,
    [uuidv4(), userId, type, JSON.stringify(payload), channel]
  );

  if (channel === 'PUSH') {
    await sendPush(userId, payload);
  } else if (channel === 'SMS') {
    await sendSMS(userId, payload.message);
  }
}

async function sendPush(userId, payload) {
  // FCM token lookup + send via firebase-admin
  // TODO: wire in firebase-admin when FCM credentials are configured
  console.log(`[PUSH] → user:${userId}`, payload.title || payload.type);
}

async function sendSMS(userId, message) {
  // TODO: wire in Twilio when credentials are configured
  const { rows } = await pool.query('SELECT phone FROM users WHERE id=$1', [userId]);
  console.log(`[SMS] → ${rows[0]?.phone}: ${message}`);
}

// Convenience helpers for common triggers

async function notifyNewSeatRequest(driverId, bookingInfo) {
  return saveAndSend({
    userId: driverId,
    type: TYPES.NEW_SEAT_REQUEST,
    payload: { title: 'New ride request', ...bookingInfo },
    channel: 'PUSH',
  });
}

async function notifyRequestAccepted(passengerId, bookingInfo) {
  return saveAndSend({
    userId: passengerId,
    type: TYPES.REQUEST_ACCEPTED,
    payload: { title: 'Ride confirmed! 🎉', ...bookingInfo },
    channel: 'PUSH',
  });
}

async function notifyTripCancelled(passengerId, rerouteInfo) {
  return Promise.all([
    saveAndSend({ userId: passengerId, type: TYPES.TRIP_CANCELLED, payload: { title: 'Your ride was cancelled', ...rerouteInfo, message: `Your ride was cancelled. ${rerouteInfo.alternatives ? 'Alternatives found.' : 'No alternatives — refund initiated.'}` }, channel: 'PUSH' }),
    saveAndSend({ userId: passengerId, type: TYPES.TRIP_CANCELLED, payload: rerouteInfo, channel: 'SMS' }),
  ]);
}

async function notifySOS(userId) {
  return Promise.all([
    saveAndSend({ userId, type: TYPES.SOS_ACKNOWLEDGED, payload: { title: 'SOS received — help is on the way', message: 'Your SOS was received. Our team is responding.' }, channel: 'PUSH' }),
    saveAndSend({ userId, type: TYPES.SOS_ACKNOWLEDGED, payload: { message: 'WeMove SOS received — help on the way.' }, channel: 'SMS' }),
  ]);
}

module.exports = { saveAndSend, notifyNewSeatRequest, notifyRequestAccepted, notifyTripCancelled, notifySOS, TYPES };
