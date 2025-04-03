import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeaveRecord from '@/models/LeaveRecord';

export async function GET(request: Request) {
    try {
        const conn = await connectDB();
        console.log('MongoDB connected successfully');
        
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        const query = date ? { date } : {};
        const records = await LeaveRecord.find(query).sort({ date: 1 });
        return NextResponse.json(records);
    } catch (error: any) {
        console.error('MongoDB GET error:', error);
        return NextResponse.json({ 
            error: 'Failed to fetch leave records', 
            details: error?.message || 'Unknown error' 
        }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const conn = await connectDB();
        console.log('MongoDB connected successfully');
        
        const data = await request.json();
        const record = await LeaveRecord.create(data);
        return NextResponse.json(record);
    } catch (error: any) {
        console.error('MongoDB POST error:', error);
        return NextResponse.json({ 
            error: 'Failed to create leave record', 
            details: error?.message || 'Unknown error' 
        }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const conn = await connectDB();
        console.log('MongoDB connected successfully');
        
        const data = await request.json();
        const { date, name, ...updateData } = data;
        
        const record = await LeaveRecord.findOneAndUpdate(
            { date, name },
            { $set: updateData },
            { new: true }
        );
        
        if (!record) {
            return NextResponse.json({ error: 'Leave record not found' }, { status: 404 });
        }
        
        return NextResponse.json(record);
    } catch (error: any) {
        console.error('MongoDB PUT error:', error);
        return NextResponse.json({ 
            error: 'Failed to update leave record', 
            details: error?.message || 'Unknown error' 
        }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const conn = await connectDB();
        console.log('MongoDB connected successfully');
        
        const data = await request.json();
        const { date, name } = data;
        
        const record = await LeaveRecord.findOneAndDelete({ date, name });
        
        if (!record) {
            return NextResponse.json({ error: 'Leave record not found' }, { status: 404 });
        }
        
        return NextResponse.json({ message: 'Leave record deleted successfully' });
    } catch (error: any) {
        console.error('MongoDB DELETE error:', error);
        return NextResponse.json({ 
            error: 'Failed to delete leave record', 
            details: error?.message || 'Unknown error' 
        }, { status: 500 });
    }
} 