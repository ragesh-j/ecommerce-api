import { z } from 'zod';

export default (schema, source = 'body') => (req, _res, next) => {
  req.validated = req.validated || {};
  req.validated[source] = schema.parse(req[source]);
  next();
};