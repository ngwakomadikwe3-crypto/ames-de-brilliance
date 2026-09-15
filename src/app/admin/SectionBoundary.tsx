"use client";
import {Component,type ReactNode} from 'react';
export default class SectionBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<section role="alert"><h2>This section could not display its data</h2><p>Choose another section, or use Refresh data to try again.</p></section>:this.props.children;}
}
