'use client';

import { useState } from 'react';
import { Alert } from './alert';
import { Card } from './card';

export function FeedbackForm() {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        try {
            setStatus('pending');
            setError(null);
            const myForm = event.target;
            const formData = new FormData(myForm);
            const res = await fetch('/__forms.html', {
                method: 'POST',
                body: formData
            });
            if (res.status === 200) {
                setStatus('ok');
            } else {
                setStatus('error');
                setError(`${res.status} ${res.statusText}`);
            }
        } catch (e) {
            setStatus('error');
            setError(`${e}`);
        }
    };

    return (
        <div className="w-full md:max-w-md">
            <Card title="Leave Feedback">
                <form name="feedback" onSubmit={handleFormSubmit} className="flex flex-col gap-3 align-center">
                    <input type="hidden" name="form-name" value="feedback" />
                    <input name="name" type="text" placeholder="Name" required className="input" />
                    <input name="email" type="email" placeholder="Email (optional)" className="input" />
                    <input name="message" type="text" placeholder="Message" required className="input" />
                    <label className="flex flex-col gap-1 text-sm text-white">
                        <span>Screenshot (optional)</span>
                        <input name="screenshot" type="file" accept="image/*" className="input bg-white/10 text-white file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-content file:cursor-pointer" />
                    </label>
                    <button className="btn" type="submit" disabled={status === 'pending'}>
                        Submit
                    </button>
                    {status === 'ok' && <Alert type="success">Submitted!</Alert>}
                    {status === 'error' && <Alert type="error">{error}</Alert>}
                </form>
            </Card>
        </div>
    );
}
