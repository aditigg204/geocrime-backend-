exports.ok = (res, data = null, message = 'Success', status = 200) => res.status(status).json({ success: true, message, data });
exports.created = (res, data = null, message = 'Created') => res.status(201).json({ success: true, message, data });
exports.fail = (res, message = 'Error', status = 400, errorCode = 'BAD_REQUEST', details = null) => {
  const payload = { success: false, message, errorCode };
  if (details !== null && process.env.NODE_ENV !== 'production') payload.details = details;
  return res.status(status).json(payload);
};
