
Portlet.register('detection', 'Detection', class extends Portlet {

  async init(options) {
    await super.init(options);
    this.node.style.width = '400px';
    this.enableResize({ min_w: 100, ratio: true });
    this.detections = {};

    // wait for the SVG document to be loaded before using it
    await new Promise((resolve, reject) => {
      const object = this.content.querySelector('object');
      object.onload = () => {
        this.field = object.getSVGDocument().getElementById('drawing');
        // explicitely initialize object height, webkit does not compute it
        // according to SVG viewBox ratio
        const viewBox = this.field.viewBox.baseVal;
        this.node.style.height = (this.node.clientWidth * viewBox.height / viewBox.width) + 'px';

        gs.robots.forEach(r => { this.detections[r] = []; });

        this.bindFrame(null, 'r3d2_tm_detection', this.updateDetections);
        this.bindFrame(null, 'r3d2_tm_arcs', this.updateArcs);
        resolve();
      }
    });
  }

  addDetection(robot) {
    const d = {};

    let irobot = gs.robots.indexOf(robot);
    if(irobot < 0 || irobot > 1) {
      irobot = 1;
    }

    const ref_frame = this.field.getElementById('reference-frame');
    const txt_frame = this.field.getElementById('coords-frame-' + irobot);

    // add container SVG object
    d.svg = this.field.createElement('g');
    ref_frame.appendChild(d.svg);

    // add "ping" SVG object
    d.ping = this.field.createElement('circle');
    d.ping.setAttributes({
      'class': 'ping-' + irobot,
      'cx': '100', 'cy': '0', 'r': '4',
    });
    d.svg.appendChild(d.ping);

    // add arc SVG objects (two lines)
    ['arc1', 'arc2'].forEach((name) => {
      const arc = this.field.createElement('line');
      arc.setAttributes({
        'class': 'arc arc-'+irobot,
        'x1': '0', 'y1': '0',
      });
      d.svg.appendChild(arc);
      d[name] = arc;
    });

    const detections = this.detections[robot];

    // add texts for coordinates
    d.txt_r = this.field.createElement('text');
    d.txt_r.setAttributes({
      'x': 0, 'y': 18 * detections.length,
      'text-align': 'right', 'text-anchor': 'end',
      'font-size': 15,
      'class': 'ping-'+irobot,
    });
    d.txt_r.textContent = '?'
    txt_frame.appendChild(d.txt_r);
    d.txt_a = this.field.createElement('text');
    d.txt_a.setAttributes({
      'x': 60, 'y': 18 * detections.length,
      'text-align': 'right', 'text-anchor': 'end',
      'font-size': 15,
      'class': 'ping-'+irobot,
    });
    d.txt_a.textContent = '?'
    txt_frame.appendChild(d.txt_a);

    detections.push(d);
    return d;
  }

  updateDetections(frame) {
    const args = frame.args;
    let d = this.detections[frame.robot][args.i];
    if(d === undefined) {
      d = this.addDetection(frame.robot);
    }
    if(args.detected) {
      d.svg.setAttribute('opacity', 1);
      d.txt_r.textContent = args.r.toFixedHtml(0);
      d.txt_a.textContent = args.a.toFixedHtml(2);
    } else {
      d.svg.setAttribute('opacity', 0);
      d.txt_r.textContent = '';
      d.txt_a.textContent = '';
      return;
    }

    let r = args.r/10.0;
    let radius;
    if(args.r < 0) {
      radius = 40;
      r = 175;
    }
    else {
      radius = 4;
    }

    const x = -r*Math.cos(args.a);
    const y = r*Math.sin(args.a);

    d.ping.setAttributes({
      'r':radius,
      'cx':x,
      'cy':y,
    });
  }

  updateArcs(frame) {
    const args = frame.args;
    let d = this.detections[frame.robot][args.i];
    if(d === undefined) {
      d = this.addDetection(frame.robot);
    }

    let x,y,r = 200;
    x = -r*Math.cos(args.a1);
    y = r*Math.sin(args.a1);
    d.arc1.setAttributes({'x2':x, 'y2':y});
    x = -r*Math.cos(args.a2);
    y = r*Math.sin(args.a2);
    d.arc2.setAttributes({'x2':x, 'y2':y});
  }

});


