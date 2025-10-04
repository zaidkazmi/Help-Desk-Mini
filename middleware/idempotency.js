const processedKeys = new Map();

function idempotency(req, res, next) {
  if (req.method !== 'POST') return next();

  const key = req.headers['idempotency-key'];
  if (!key) return next(); // Optional

  if (processedKeys.has(key)) {
    const cached = processedKeys.get(key);
    return res.status(cached.status).json(cached.body);
  }

  // Intercept the response
  const originalJson = res.json;
  res.json = function(body) {
    processedKeys.set(key, { status: res.statusCode, body });
    originalJson.call(this, body);
  };

  next();
}

module.exports = idempotency;