import { Hono } from 'hono';
import nodemailer from 'nodemailer';
import { config } from 'dotenv';

config(); // Load environment variables

const app = new Hono();

// POST endpoint to send an email
app.post('/', async (ctx) => {
  try {
    // Parse request body
    const { to, subject, body } = await ctx.req.json();

    // Check if all necessary fields are provided
    if (!to || !subject || !body) {
      return ctx.json({ error: 'Missing required fields' }, 400);
    }

    // Create reusable transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false, // true for port 465, false for other ports
      auth: {
        user: process.env.SMTP_USER, // SMTP username
        pass: process.env.SMTP_PASSWORD, // SMTP password
      },
    });

    // Set up email data
    const mailOptions = {
      from: process.env.SMTP_USER, // Sender address
      to, // List of recipients
      subject, // Subject line
      text: body, // Plain text body
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Return success response
    return ctx.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
