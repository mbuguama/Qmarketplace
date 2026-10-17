const express = require('express');
const { loginUser, registerUser } = require('../services/dataService');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body || {};
    if (![firstName, lastName, email, password].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ message: 'Please complete all fields.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: 'Password must be between 8 and 128 characters.' });
    }

    const payload = await registerUser({ firstName, lastName, email, password });
    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const payload = await loginUser({ email, password });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
