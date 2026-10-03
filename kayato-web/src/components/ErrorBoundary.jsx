import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('KayaTo render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="error-screen">
        <div className="empty-mark">K</div>
        <h1>KayaTo could not load</h1>
        <p>{this.state.error.message}</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>Reload KayaTo</button>
      </main>
    );
  }
}
