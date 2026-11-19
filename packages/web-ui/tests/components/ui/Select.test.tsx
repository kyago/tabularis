import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {Select} from '@/components/ui/Select';

describe('Select', () => {
    it('names the trigger and selects a labeled option', () => {
        const onChange = vi.fn();
        render(
            <Select
                ariaLabel="Connection string example"
                value={null}
                options={['mysql://localhost/shop']}
                labels={{'mysql://localhost/shop': 'Local MySQL'}}
                placeholder="Choose an example"
                searchable={false}
                onChange={onChange}
            />,
        );

        const trigger = screen.getByRole('button', {
            name: 'Connection string example',
        });
        expect(trigger).toHaveTextContent('Choose an example');
        expect(trigger).toHaveClass('focus-visible:outline-focus');

        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('button', {name: 'Local MySQL'}));
        expect(onChange).toHaveBeenCalledWith('mysql://localhost/shop');
    });

    it('offers the typed text as a value when custom options are allowed', () => {
        const onChange = vi.fn();
        render(
            <Select
                ariaLabel="Model"
                value={null}
                options={['gpt-4o', 'gpt-4o-mini']}
                customOption={(value) => `Use "${value}"`}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Model'}));
        const search = screen.getByPlaceholderText('Search...');
        // An exact option needs no custom row.
        fireEvent.change(search, {target: {value: 'gpt-4o'}});
        expect(screen.queryByRole('button', {name: 'Use "gpt-4o"'})).not.toBeInTheDocument();

        fireEvent.change(search, {target: {value: ' my-deployment '}});
        expect(screen.getByRole('button', {name: 'Use "my-deployment"'})).toBeInTheDocument();
        fireEvent.keyDown(search, {key: 'Enter'});
        expect(onChange).toHaveBeenCalledWith('my-deployment');
    });
});
