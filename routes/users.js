const express = require('express');
const User = require('../models/user');
const mongoose = require('mongoose');

const router = express.Router();

// create users
router.post('/', async function (req, res) {
    const { name, email } = req.body || {};

    // validate the input, then write into database
    if (
        typeof name !== 'string' || !name.trim() ||
        typeof email !== 'string' || !email.trim()
    ) {
        return res.status(400).json({
            message: 'Name and email must be non-empty strings.',
            data: {}
        });
    }

    try {
        const user = await User.create({
            name,
            email
        });

        return res.status(201).json({
            message: 'User created.',
            data: user
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                message: 'Email is already in use.',
                data: {}
            });
        }

        return res.status(500).json({
            message: 'Could not create user.',
            data: {}
        });
    }
});

// read the user list
router.get('/', async function (req, res) {
    try {
        const users = await User.find();

        return res.status(200).json({
            message: 'OK',
            data: users
        });
    } catch (err) {
        return res.status(500).json({
            message: 'Could not retrieve users.',
            data: {}
        });
    }
});

// read user info by id
router.get('/:id', async function (req, res) {
    const id = req.params.id;

    if (!mongoose.isObjectIdOrHexString(id)) {
        return res.status(404).json({
            message: 'User not found.',
            data: {}
        });
    }

    try {
        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found.',
                data: {}
            });
        }

        return res.status(200).json({
            message: 'OK',
            data: user
        });
    } catch (err) {
        return res.status(500).json({
            message: 'Could not retrieve user.',
            data: {}
        });
    }
});

module.exports = router;