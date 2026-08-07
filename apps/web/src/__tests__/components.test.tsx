import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Button, Input, Badge, Alert, EmptyState, Skeleton } from '../components/index.js';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDefined();
  });

  it('applies variant class', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('btn-danger');
  });

  it('shows loading state', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
  });
});

describe('Input', () => {
  it('renders label and input', () => {
    render(<Input label="Email" type="email" />);
    expect(screen.getByLabelText('Email')).toBeDefined();
  });

  it('shows error message', () => {
    render(<Input label="Name" error="Required" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Required');
  });

  it('sets aria-invalid on error', () => {
    render(<Input label="Name" error="Required" />);
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Badge', () => {
  it('renders with variant', () => {
    render(<Badge variant="success">Active</Badge>);
    const badge = screen.getByText('Active');
    expect(badge.className).toContain('badge-success');
  });
});

describe('Alert', () => {
  it('renders with role alert', () => {
    render(<Alert variant="danger">Error occurred</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Error occurred');
  });

  it('calls onDismiss when dismissed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Alert variant="info" onDismiss={onDismiss}>Info</Alert>);
    await user.click(screen.getByLabelText('Dispensar alerta'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data" />);
    expect(screen.getByText('No data')).toBeDefined();
  });
});

describe('Skeleton', () => {
  it('renders with aria-hidden', () => {
    const { container } = render(<Skeleton />);
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
