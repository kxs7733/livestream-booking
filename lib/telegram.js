'use strict';
const { db } = require('./db');

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;

async function telegramSend(method, payload) {
  const token = BOT_TOKEN();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error('[telegram]', method, err.message);
    return null;
  }
}

async function getTelegramChatId(telegramUsername) {
  if (!telegramUsername) return null;
  const clean = String(telegramUsername).replace('@', '').toLowerCase();
  const { data } = await db.client.from('telegram_users').select('chat_id').eq('username', clean).maybeSingle();
  return data ? data.chat_id : null;
}

async function saveTelegramUser(username, chatId) {
  if (!username) return;
  const clean = String(username).toLowerCase();
  await db.upsert('telegram_users', {
    username: clean,
    chatId: String(chatId),
    updatedAt: new Date().toISOString(),
  }, 'username');
}

async function getInternalPicContactString() {
  try {
    const { data } = await db.client.from('business_mapping_values').select('*').eq('active', 'ACTIVE');
    if (data && data.length) {
      const pics    = data.filter(v => v.type === 'InternalPIC');
      const numbers = data.filter(v => v.type === 'InternalPICNumber');
      if (pics.length) {
        return pics.map((p, i) => {
          const num = numbers[i] ? numbers[i].description : (process.env.FALLBACK_PIC_NUMBER || '+65 9456 8465');
          return p.description + ' - ' + num;
        }).join(' / ');
      }
    }
  } catch (err) {
    console.error('[telegram] getInternalPicContactString error:', err.message);
  }
  return (process.env.FALLBACK_PIC_NAME || 'Shopee Livestream Talent Management PIC') + ' - ' + (process.env.FALLBACK_PIC_NUMBER || '+65 9456 8465');
}

function formatDateDDMMMYYYY(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  return parts[2] + ' ' + month + ' ' + parts[0];
}

async function getRmEmail(shopId) {
  if (!shopId) return '';
  const { data } = await db.client.from('managed_sellers').select('rm_email').eq('shop_id', String(shopId)).maybeSingle();
  return data ? (data.rm_email || '') : '';
}

// ─── Notification functions ────────────────────────────────────────────────────

async function sendApprovalNotificationForRow(row) {
  const chatId = await getTelegramChatId(row.telegram);
  if (!chatId) return false;

  const time = row.streamEndTime ? (row.streamTime || '') + ' – ' + row.streamEndTime : (row.streamTime || '');
  const dateTimeText = formatDateDDMMMYYYY(row.streamDate) + (time ? ' ' + time : '');
  const contactString = await getInternalPicContactString();
  const address = (row.shippingAddress || 'N/A') + (row.shippingPostalCode ? ', S' + row.shippingPostalCode : '');

  const message =
    '<b>📢 Shopee Livestream Confirmation</b>\n\n' +
    'Hi! Your livestream slot has been confirmed by Shopee. Please see the details below:\n\n' +
    '<b>Shop:</b> ' + (row.brandName || row.shopName) + '\n\n' +
    '<b>Date, Time:</b> ' + dateTimeText + '\n\n' +
    '<b>Shipping Address:</b> ' + address + '\n\n' +
    '<b>Important Reminders:</b>\n' +
    '✅ Please adhere strictly to the confirmed stream date and time.\n' +
    '⚠️ Rescheduling: If you need to reschedule, you may do so on the Shopee Live Creator portal and kindly notify the Shopee Livestream Talent Management Team at: ' + contactString + ' at least 3 working days in advance.\n\n' +
    'Thank you for your cooperation!';

  await telegramSend('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML' });
  return true;
}

async function sendRescheduledApprovalNotification(row, chatId, oldDate, oldStartTime, oldEndDate, oldEndTime) {
  const oldSlot = formatDateDDMMMYYYY(oldDate) + (oldStartTime ? ' ' + oldStartTime : '') + (oldEndTime ? ' – ' + oldEndTime : '');
  const newTime = row.streamEndTime ? (row.streamTime || '') + ' – ' + row.streamEndTime : (row.streamTime || '');
  const newSlot = formatDateDDMMMYYYY(row.streamDate) + (newTime ? ' ' + newTime : '');

  const message =
    '<b>Your livestream application has been rescheduled.</b>\n\n' +
    '<b>Shop:</b> ' + (row.brandName || row.shopName) + '\n' +
    '<b>Previous slot:</b> Date, Time: ' + oldSlot + '\n' +
    '<b>New slot:</b> Date, Time: ' + newSlot + '\n\n' +
    'Please adhere strictly to the confirmed stream date and time.\n\n' +
    'Thank you!';

  await telegramSend('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML' });
}

async function sendSampleSentNotification(row) {
  const chatId = await getTelegramChatId(row.telegram);
  if (!chatId) return false;

  const shopName = row.brandName || row.shopName || 'The brand';
  const time = row.streamEndTime ? (row.streamTime || '') + ' – ' + row.streamEndTime : (row.streamTime || '');
  const slotText = formatDateDDMMMYYYY(row.streamDate) + (time ? ' ' + time : '');

  const message =
    '📦 <b>Samples have been dispatched!</b>\n\n' +
    '<b>' + shopName + '</b> has sent out the samples for the livestream on <b>' + slotText + '</b>.\n\n' +
    'Kindly confirm that you have received the samples once they have arrived by clicking the button below, or log in to the app.';

  const resp = await telegramSend('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({
      inline_keyboard: [[{ text: "✅ I've Received the Samples", callback_data: 'sample_received_' + row.id }]]
    }),
  });

  if (resp && resp.ok && resp.result && resp.result.message_id) {
    await db.setProp('sampleMsg_' + row.id, chatId + ':' + resp.result.message_id);
  }
  return true;
}

async function sendSampleUndoNotification(row) {
  const chatId = await getTelegramChatId(row.telegram);
  if (!chatId) return false;

  const shopName = row.brandName || row.shopName || 'The brand';
  const time = row.streamEndTime ? (row.streamTime || '') + ' – ' + row.streamEndTime : (row.streamTime || '');
  const slotText = formatDateDDMMMYYYY(row.streamDate) + (time ? ' ' + time : '');

  const stored = await db.getProp('sampleMsg_' + row.id);
  if (stored) {
    const [storedChatId, storedMsgId] = stored.split(':');
    try {
      await telegramSend('editMessageReplyMarkup', {
        chat_id: storedChatId,
        message_id: parseInt(storedMsgId, 10),
        reply_markup: JSON.stringify({ inline_keyboard: [] }),
      });
    } catch (_) {}
  }

  await telegramSend('sendMessage', {
    chat_id: chatId,
    text: 'Hi, there was an update — please disregard the previous sample dispatch notification for <b>' + shopName + '</b>\'s livestream on <b>' + slotText + '</b>.\n\nWe\'ll notify you again once the samples are on the way.',
    parse_mode: 'HTML',
  });
  return true;
}

async function sendRejectionNotification_CreatorApp(creatorApp, reason) {
  const chatId = await getTelegramChatId(creatorApp.telegram);
  if (!chatId) return;
  const time = creatorApp.streamEndTime ? (creatorApp.streamTime || '') + ' – ' + creatorApp.streamEndTime : (creatorApp.streamTime || '');
  const contactString = await getInternalPicContactString();

  const message =
    '<b>Your livestream application has been rejected.</b>\n\n' +
    '<b>Shop:</b> ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n' +
    '<b>Date, Time:</b> ' + formatDateDDMMMYYYY(creatorApp.streamDate) + (time ? ' ' + time : '') + '\n\n' +
    '<b>Reason:</b>\n' + (reason || '') + '\n\n' +
    '<b>Next Steps:</b>\n' +
    "Please check the Brand Match Portal for other available campaigns. We'd love to see you apply for other brands!\n\n" +
    'Thank you.\n\n' +
    '*If you have any questions, please reach out to ' + contactString + '.';

  await telegramSend('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML' });
}

async function sendCancellationNotification_CreatorApp(creatorApp, reason) {
  const chatId = await getTelegramChatId(creatorApp.telegram);
  if (!chatId) return;
  const contactString = await getInternalPicContactString();

  const message =
    '<b>Your livestream application has been cancelled.</b>\n\n' +
    '<b>Shop:</b> ' + (creatorApp.brandName || creatorApp.shopName || '') + '\n' +
    '<b>Date, Time:</b> ' + formatDateDDMMMYYYY(creatorApp.streamDate) + (creatorApp.streamTime ? ' ' + creatorApp.streamTime : '') + '\n\n' +
    '<b>Reason:</b>\n' + (reason || '') + '\n\n' +
    '<b>Next Steps:</b>\n' +
    "Please check the Brand Match Portal for other available campaigns. We'd love to see you apply for other brands!\n\n" +
    'Thank you.\n\n' +
    '*If you have any questions, please reach out to ' + contactString + '.';

  await telegramSend('sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML' });
}

module.exports = {
  telegramSend,
  getTelegramChatId,
  saveTelegramUser,
  getInternalPicContactString,
  formatDateDDMMMYYYY,
  getRmEmail,
  sendApprovalNotificationForRow,
  sendRescheduledApprovalNotification,
  sendSampleSentNotification,
  sendSampleUndoNotification,
  sendRejectionNotification_CreatorApp,
  sendCancellationNotification_CreatorApp,
};
