const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/task');
const User = require('../models/user');

const router = express.Router();

router.post('/', async function (req, res) {
    const {
        name,
        deadline,
        description = '',
        completed = false,
        assignedUser = '',
        assignedUserName
    } = req.body || {};

    // validate the field's type
    if (
        typeof name !== 'string' || !name.trim() ||
        !['string', 'number'].includes(typeof deadline) ||
        (typeof deadline === 'string' && !deadline.trim()) ||
        !Number.isFinite(new Date(deadline).getTime()) ||
        typeof description !== 'string' ||
        typeof completed !== 'boolean' ||
        typeof assignedUser !== 'string' ||
        (
            assignedUserName !== undefined &&
            typeof assignedUserName !== 'string'
        )
    ) {
        return res.status(400).json({
            message: 'Invalid task fields. Name and a valid deadline are required.',
            data: {}
        });
    }


    if (
        assignedUser !== '' &&
        !mongoose.isObjectIdOrHexString(assignedUser)
    ) {
        return res.status(400).json({
            message: 'Assigned user ID is invalid.',
            data: {}
        });
    }

    if (
        assignedUser === '' &&
        assignedUserName !== undefined &&
        assignedUserName !== 'unassigned'
    ) {
        return res.status(400).json({
            message: 'An unassigned task must use the name "unassigned".',
            data: {}
        });
    }

    try {
        let createdTask;

        await mongoose.connection.transaction(async function (session) {
            let user = null;

            if (assignedUser !== '') {
                user = await User.findById(assignedUser).session(session);

                if (!user) {
                    const error = new Error('Assigned user not found.');
                    error.status = 404;
                    throw error;
                }

                if (
                    assignedUserName !== undefined &&
                    assignedUserName !== user.name
                ) {
                    const error = new Error('Assigned user name does not match.');
                    error.status = 400;
                    throw error;
                }
            }

            const tasks = await Task.create([{
                name,
                deadline,
                description,
                completed,
                assignedUser: user ? user._id.toString() : '',
                assignedUserName: user ? user.name : 'unassigned'
            }], { session });

            createdTask = tasks[0];

            if (user && !completed) {
                await User.updateOne(
                    { _id: user._id },
                    { $addToSet: { pendingTasks: createdTask._id.toString() } },
                    { session }
                );
            }
        });

        return res.status(201).json({
            message: 'Task created.',
            data: createdTask
        });
    } catch (err) {
        return res.status(err.status || 500).json({
            message: err.status ? err.message : 'Could not create task.',
            data: {}
        });
    }
});


// read the task list
router.get('/', async function (req, res) {
    let where = {};
    let sort = {};
    let select = {};
    let skip = 0;
    let limit = 100; // In Mongoose that means unlimited
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
            data = await Task.countDocuments(where);
        } else {
            data = await Task.find(where)
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

// read task info by id
router.get('/:id', async function (req, res) {
    const id = req.params.id;

    if (!mongoose.isObjectIdOrHexString(id)) {
        return res.status(404).json({
            message: 'Task not found.',
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
        const task = await Task.findById(id).select(select);

        if (!task) {
            return res.status(404).json({
                message: 'Task not found.',
                data: {}
            });
        }

        return res.status(200).json({
            message: 'OK',
            data: task
        });
    } catch (err) {
        return res.status(500).json({
            message: 'Could not retrieve task.',
            data: {}
        });
    }
});


router.delete('/:id', async function (req, res) {
    const id = req.params.id;

    if (!mongoose.isObjectIdOrHexString(id)) {
        return res.status(404).json({
            message: 'Task not found.',
            data: {}
        });
    }

    try {
        await mongoose.connection.transaction(async function (session) {
            const task = await Task.findById(id).session(session);

            if (!task) {
                const error = new Error('Task not found.');
                error.status = 404;
                throw error;
            }

            
            await User.updateMany(
                { pendingTasks: id },
                { $pull: { pendingTasks: id } },
                { session }
            );

            await Task.deleteOne(
                { _id: id },
                { session }
            );
        });

        return res.status(200).json({
            message: 'Task deleted.',
            data: {}
        });
    } catch (err) {
        return res.status(err.status || 500).json({
            message: err.status ? err.message : 'Could not delete task.',
            data: {}
        });
    }
});


router.put('/:id', async function (req, res) {
    const id = req.params.id;

    if (!mongoose.isObjectIdOrHexString(id)) {
        return res.status(404).json({
            message: 'Task not found.',
            data: {}
        });
    }

    try {
        let updatedTask;

        await mongoose.connection.transaction(async function (session) {
            const task = await Task.findById(id).session(session);


            if (!task) {
                const error = new Error('Task not found.');
                error.status = 404;
                throw error;
            }

            const {
                name,
                deadline,
                description = '',
                completed = false,
                assignedUser = '',
                assignedUserName
            } = req.body || {};


            function fail(status, message) {
                const error = new Error(message);
                error.status = status;
                throw error;
            }

            if (
                typeof name !== 'string' || !name.trim() ||
                !['string', 'number'].includes(typeof deadline) ||
                (typeof deadline === 'string' && !deadline.trim()) ||
                !Number.isFinite(new Date(deadline).getTime()) ||
                typeof description !== 'string' ||
                typeof completed !== 'boolean' ||
                typeof assignedUser !== 'string' ||
                (
                    assignedUserName !== undefined &&
                    typeof assignedUserName !== 'string'
                )
            ) {
                fail(400, 'Invalid task fields.');
            }

            if (
                assignedUser !== '' &&
                !mongoose.isObjectIdOrHexString(assignedUser)
            ) {
                fail(400, 'Assigned user ID is invalid.');
            }

            if (
                assignedUser === '' &&
                assignedUserName !== undefined &&
                assignedUserName !== 'unassigned'
            ) {
                fail(400, 'An unassigned task must use the name "unassigned".');
            }

            let user = null;

            if (assignedUser !== '') {
                user = await User.findById(assignedUser).session(session);

                if (!user) {
                    fail(404, 'Assigned user not found.');
                }

                if (
                    assignedUserName !== undefined &&
                    assignedUserName !== user.name
                ) {
                    fail(400, 'Assigned user name does not match.');
                }
            }

            
            const taskId = task._id.toString();

            await User.updateMany(
                { pendingTasks: taskId },
                { $pull: { pendingTasks: taskId } },
                { session }
            );

            
            task.name = name;
            task.deadline = deadline;
            task.description = description;
            task.completed = completed;
            task.assignedUser = user ? user._id.toString() : '';
            task.assignedUserName = user ? user.name : 'unassigned';

            await task.save({ session });


            
            if (user && !completed) {
                await User.updateOne(
                    { _id: user._id },
                    { $addToSet: { pendingTasks: taskId } },
                    { session }
                );
            }

            updatedTask = task;
        });

        return res.status(200).json({
            message: 'Task updated.',
            data: updatedTask
        });
    } catch (err) {
        return res.status(err.status || 500).json({
            message: err.status ? err.message : 'Could not update task.',
            data: {}
        });
    }
});

module.exports = router;