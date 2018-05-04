import { INoteElementComponentProps } from '../NoteElementComponent';
import * as React from 'react';
import { dataURItoBlob } from '../../../../util';
import { trim } from './trim-canvas';
import Resizable from 're-resizable';
import { Input, Row } from 'react-materialize';

type Touch = {
	identifier: number;
	x: number;
	y: number;
};

type Position = {
	x: number,
	y: number
};

export default class DrawingElementComponent extends React.Component<INoteElementComponentProps> {
	private imageElement: HTMLImageElement;
	private hasTrimmed: boolean;

	private canvasElement: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private ongoingTouches: Touch[] = [];
	private canvasImage: Blob | null;

	private isErasing = false;
	private isRainbow = false;

	render() {
		const { element, noteAssets, elementEditing } = this.props;
		const isEditing = element.args.id === elementEditing;

		this.hasTrimmed = false;

		if (isEditing) {
			return (
				<div>
					<Resizable
						style={{padding: '5px', overflow: 'hidden'}}
						minWidth={410}
						minHeight={130}
						lockAspectRatio={true}
						onResizeStart={() => {
							this.canvasElement.toBlob(result => this.canvasImage = result);
						}}
						onResize={(e, d, ref) => {
							this.canvasElement.width = parseInt(ref.style.width!, 10) - 10;
							this.canvasElement.height = parseInt(ref.style.height!, 10) - 10;

							if (!!this.canvasImage) {
								const img = new Image();
								img.onload = () => this.ctx.drawImage(img, 0, 0);
								img.src = URL.createObjectURL(this.canvasImage);
							}
						}}
						onResizeStop={() => {
							if (!!this.canvasImage) {
								const img = new Image();
								img.onload = () => this.ctx.drawImage(img, 0, 0);
								img.src = URL.createObjectURL(this.canvasImage);
								this.canvasImage = null;
							}
						}}
						>
						<canvas
							ref={e => this.canvasElement = e!}
							width="600"
							height="500"
							style={{border: 'solid black 1px', touchAction: 'none'}} />
					</Resizable>

					<Row style={{padding: '5px'}}>
						<Input label="Erase Mode" type="checkbox" className="filled-in" onChange={(e, v) => this.isErasing = v} />
						<Input label={<a target="_blank" rel="nofollow noreferrer" href="https://pride.codes">Rainbow Mode</a>} type="checkbox" className="filled-in" onChange={(e, v) => this.isRainbow = v} />
					</Row>
				</div>
			);
		}

		return (
			<div style={{overflow: 'hidden', height: 'auto', minWidth: '170px', minHeight: '130px'}} onClick={this.openEditor}>
				<img ref={elm => this.imageElement = elm!} style={{height: 'auto', width: 'auto', minWidth: '0px', minHeight: '0px'}} src={noteAssets[element.args.ext!]} />
			</div>
		);
	}

	componentDidMount() {
		this.componentDidUpdate();
	}

	componentDidUpdate() {
		const { element, noteAssets } = this.props;

		this.ongoingTouches = [];
		this.isErasing = false;
		this.isRainbow = false;
		if (!!this.canvasElement) {
			this.initCanvas();

			// Restore saved image to canvas
			const img = new Image();
			img.onload = () => {
				this.canvasElement.width = img.naturalWidth;
				this.canvasElement.height = img.naturalHeight;
				this.ctx.drawImage(img, 0, 0);
			};
			img.src = noteAssets[element.args.ext!];
			return;
		}

		this.imageElement.onload = () => {
			if (this.hasTrimmed) return;

			const tmpCanvas: HTMLCanvasElement = document.createElement('canvas');
			tmpCanvas.setAttribute('width', this.imageElement.naturalWidth.toString());
			tmpCanvas.setAttribute('height', this.imageElement.naturalHeight.toString());

			const tmpContext = tmpCanvas.getContext('2d')!;
			tmpContext.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);
			tmpContext.drawImage(this.imageElement, 0, 0);

			this.hasTrimmed = true;
			this.imageElement.src = URL.createObjectURL(dataURItoBlob(trim(tmpCanvas).toDataURL()));
		};
	}

	componentWillUpdate() {
		const { element, updateElement } = this.props;
		if (!this.canvasElement) return;

		// Update element with canvas contents replacing the old asset
		updateElement!(element.args.id, element, dataURItoBlob(this.canvasElement.toDataURL()));
	}

	private initCanvas = () => {
		this.ctx = this.canvasElement.getContext('2d')!;
		let ongoingPos: Position;

		this.canvasElement.onpointerdown = event => {
			this.ongoingTouches.push(this.copyTouch(event));
			this.ctx.beginPath();
		};

		this.canvasElement.onpointermove = event => {
			const pos = this.getRealPosition(this.copyTouch(event));
			if (event.pressure < 0) return;

			this.ctx.strokeStyle = this.getLineStyle();

			const idx = this.ongoingTouchIndexById(event.pointerId);
			if (idx < 0) return;

			if (this.shouldErase(event)) {
				this.ctx.clearRect(pos.x - 10, pos.y - 10, 20, 20);
				return;
			}

			this.ctx.beginPath();
			ongoingPos = this.getRealPosition(this.ongoingTouches[idx]);
			this.ctx.moveTo(ongoingPos.x, ongoingPos.y);
			this.ctx.lineTo(pos.x, pos.y);
			this.ctx.lineWidth = event.pressure * 10;
			this.ctx.lineCap = 'round';
			this.ctx.stroke();

			this.ongoingTouches.splice(idx, 1, this.copyTouch(event));
		};

		this.canvasElement.onpointerup = event => {
			const pos = this.getRealPosition(this.copyTouch(event));
			const idx = this.ongoingTouchIndexById(event.pointerId);
			if (idx < 0 && !this.shouldErase(event)) return;

			this.ctx.lineWidth = event.pressure * 10;
			this.ctx.fillStyle = this.getLineStyle();
			this.ctx.beginPath();
			ongoingPos = this.getRealPosition(this.ongoingTouches[idx]);

			this.ctx.moveTo(ongoingPos.x, ongoingPos.y);
			this.ctx.lineTo(pos.x, pos.y);

			this.ongoingTouches.splice(idx, 1);
		};

		this.canvasElement.onpointercancel = event => {
			const idx = this.ongoingTouchIndexById(event.pointerId);
			this.ongoingTouches.splice(idx, 1);
		};
	}

	private copyTouch = (event: PointerEvent): Touch => {
		return {
			identifier: event.pointerId,
			x: event.clientX,
			y: event.clientY
		};
	}

	private getRealPosition = (touch: Touch): Position => {
		const { element } = this.props;

		const noteViewer = document.getElementById('note-viewer')!;

		const canvasOffset = {
			left: parseInt(element.args.x, 10) - noteViewer.scrollLeft,
			top: (parseInt(element.args.y, 10) + 128) - noteViewer.scrollTop
		};

		return {
			x: touch.x - canvasOffset.left,
			y: touch.y - canvasOffset.top
		};
	}

	private ongoingTouchIndexById = (id: number): number => {
		for (let i = 0; i < this.ongoingTouches.length; i++) {
			if (id === this.ongoingTouches[i].identifier) return i;
		}

		return -1;
	}

	private shouldErase = (event: PointerEvent): boolean => {
		return this.isErasing || event.buttons === 32;
	}

	private getLineStyle = (): string => {
		return (this.isRainbow) ? '#' + Math.random().toString(16).substr(-6) : '#000000';
	}

	private openEditor = () => {
		const { element, edit } = this.props;

		edit(element.args.id);
	}
}
