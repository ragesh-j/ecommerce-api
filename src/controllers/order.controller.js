import * as orderService from '../services/order.service.js';

// ---------- Customer ----------

export const create = async (req, res) => {
  const order = await orderService.placeOrder(req.user._id, req.validated.body.items);
  res.status(201).json({ success: true, message: 'Order placed', data: { order } });
};

export const myList = async (req, res) => {
  const result = await orderService.listMyOrders(req.user._id, req.validated.query);
  res.status(200).json({ success: true, data: result.orders, pagination: result.pagination });
};

export const cancel = async (req, res) => {
  const order = await orderService.cancelMyOrder(req.user._id, req.validated.params.id);
  res.status(200).json({ success: true, message: 'Order cancelled', data: { order } });
};

// ---------- Customer (own) or Admin (any) ----------

export const getOne = async (req, res) => {
  const order = await orderService.getOrder(req.validated.params.id, req.user);
  res.status(200).json({ success: true, data: { order } });
};

// ---------- Admin ----------

export const adminList = async (req, res) => {
  const result = await orderService.listAllOrders(req.validated.query);
  res.status(200).json({ success: true, data: result.orders, pagination: result.pagination });
};

export const updateStatus = async (req, res) => {
  const order = await orderService.updateOrderStatus(
    req.validated.params.id,
    req.validated.body.status
  );
  res.status(200).json({ success: true, message: `Order ${order.status}`, data: { order } });
};