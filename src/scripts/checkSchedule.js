const mongoose = require('mongoose');
const DaySchedule = require('../models/DaySchedule').default;

async function checkSchedule() {
    try {
        await mongoose.connect('mongodb://localhost:27017/calendar');
        console.log('Connected to MongoDB');

        const schedule = await DaySchedule.findOne({ date: '2025-04-07' });
        console.log('Schedule for 2025-04-07:', schedule);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkSchedule(); 