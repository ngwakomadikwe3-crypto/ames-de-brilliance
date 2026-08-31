"use client";
import JewelryViewer from "./JewelryViewer";
import type { AMESViewerProps } from "@/data/jewelry/jewelryTypes";
export default function AMESJewelryViewer({ onAsk: _onAsk, ...props }: AMESViewerProps) { return <JewelryViewer {...props} />; }
