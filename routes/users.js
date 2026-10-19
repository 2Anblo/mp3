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
    let where = {};
    let sort = {};
    let select = {};
    let skip = 0;
    let limit = 0; // In Mongoose that means unlimited
    let count = false;

    try {
        if (req.query.where !== undefined) {
            where = JSON.parse(req.query.where);
        }
        if (req.query.sort !== undefined) {
            sort = JSON.parse(req.query.sort);
        }
        if (req.query.select !== undefined) {
            select = JSON.parse(req.query.select);
        }
        if (req.query.skip !== undefined) {
            skip = JSON.parse(req.query.skip);
        }
        if (req.query.limit !== undefined) {
            limit = JSON.parse(req.query.limit);
        }
        if (req.query.count !== undefined) {
            count = JSON.parse(req.query.count);
        }
    } catch (err) {
        return res.status(400).json({
            message: 'Query parameters must be valid JSON.',
            data: {}
        });
    }

    const isObject = value =>
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value);

    if (
        !isObject(where) ||
        !isObject(sort) ||
        !isObject(select) ||
        !Number.isSafeInteger(skip) || skip < 0 ||
        !Number.isSafeInteger(limit) || limit < 0 ||
        typeof count !== 'boolean'
    ) {
        return res.status(400).json({
            message: 'Invalid query parameter types or values.',
            data: {}
        });
    }

    if (!Object.values(sort).every(value => value === 1 || value === -1)) {
        return res.status(400).json({
            message: 'Sort values must be 1 or -1.',
            data: {}
        });
    }

    if (!Object.values(select).every(value => value === 0 || value === 1)) {
        return res.status(400).json({
            message: 'Select values must be 0 or 1.',
            data: {}
        });
    }

    const selectValues = Object.entries(select)
        .filter(([key]) => key !== '_id')
        .map(([, value]) => value);

    if (selectValues.includes(0) && selectValues.includes(1)) {
        return res.status(400).json({
            message: 'Select cannot mix included and excluded fields.',
            data: {}
        });
    }


    try {
        let data;

        if (count) {
            data = await User.countDocuments(where);
        } else {
            data = await User.find(where)
                .sort(sort)
                .select(select)
                .skip(skip)
                .limit(limit);
        }

        return res.status(200).json({
            message: 'OK',
            data
        });
    } catch (err) {
        if (err.name === 'CastError' || err.name === 'StrictModeError') {
            return res.status(400).json({
                message: 'Invalid query field or value.',
                data: {}
            });
        }

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

    let select;

    if (req.query.select !== undefined) {
        try {
            select = JSON.parse(req.query.select);
        } catch (err) {
            return res.status(400).json({
                message: 'Select must be valid JSON.',
                data: {}
            });
        }

        if (
            select === null ||
            typeof select !== 'object' ||
            Array.isArray(select) ||
            !Object.values(select).every(value => value === 0 || value === 1)
        ) {
            return res.status(400).json({
                message: 'Select must be an object with values of 0 or 1.',
                data: {}
            });
        }

        const values = Object.entries(select)
            .filter(([key]) => key !== '_id')
            .map(([, value]) => value);

        if (values.includes(0) && values.includes(1)) {
            return res.status(400).json({
                message: 'Select cannot mix included and excluded fields.',
                data: {}
            });
        }
    }

    try {
        const user = await User.findById(id).select(select);

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