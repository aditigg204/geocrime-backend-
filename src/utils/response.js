exports.ok = (res, data = null, message = 'Success', status = 200) => res.status(status).json({ success: true, message, data });
exports.created = (res, data = null, message = 'Created') => res.status(201).json({ success: true, message, data });
exports.fail = (res, message = 'Error', status = 400, details = null) => res.status(status).json({ success: false, message, details });
