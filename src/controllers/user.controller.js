import * as userService from '../services/user.service.js';

export const register = async (req, res) => {
  const { user, token } = await userService.register(req.validated.body);
  res.status(201).json({ success: true, message: 'Registered successfully', data: { user, token } });
};

export const login = async (req, res) => {
  const { user, token } = await userService.login(req.validated.body);
  res.status(200).json({ success: true, message: 'Login successful', data: { user, token } });
};

export const getMe = async (req, res) => {
  const user = await userService.getProfile(req.user._id);
  res.status(200).json({ success: true, data: { user } });
};

export const updateMe = async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.validated.body);
  res.status(200).json({ success: true, message: 'Profile updated', data: { user } });
};

// ---------- Admin ----------

export const listUsers = async (req, res) => {
  const result = await userService.listUsers(req.validated.query);
  res.status(200).json({ success: true, data: result.users, pagination: result.pagination });
};

export const getUser = async (req, res) => {
  const user = await userService.getUserById(req.validated.params.id);
  res.status(200).json({ success: true, data: { user } });
};

export const setStatus = async (req, res) => {
  const user = await userService.setUserStatus(
    req.user._id,
    req.validated.params.id,
    req.validated.body.isActive
  );
  res.status(200).json({
    success: true,
    message: `User ${user.isActive ? 'activated' : 'deactivated'}`,
    data: { user },
  });
};