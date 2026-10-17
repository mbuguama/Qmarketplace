const express = require('express');
const { createContactQuery } = require('../services/contactService');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const fields = ['name', 'email', 'subject', 'message'];
    if (!fields.every((field) => typeof body[field] === 'string' && body[field].trim())) {
      return res.status(400).json({ message: 'Complete all contact form fields.' });
    }
    const input = Object.fromEntries(fields.map((field) => [field, body[field].trim()]));
    if (input.name.length > 120 || input.email.length > 254 || input.subject.length > 160 || input.message.length > 5000) {
      return res.status(400).json({ message: 'One or more contact fields exceed the allowed length.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    const query = await createContactQuery(input);
    return res.status(201).json({ message: 'Your message was received.', query });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
