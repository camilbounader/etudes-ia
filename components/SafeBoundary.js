"use client";

import { Component } from "react";
import { reportClientError } from "@/lib/clientErrors";

// Filet de sécurité : si un bloc plante à l'affichage, on montre un texte de secours
// au lieu de faire tomber toute la page, et on enregistre l'erreur.
export default class SafeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    reportClientError(error, { where: this.props.where || "bloc", stack: info?.componentStack });
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <p className="text-sm text-red-700">Affichage impossible ({String(this.state.error?.message || this.state.error)}).</p>;
  }
}
