
Portlet.register('field', 'Field', class extends Portlet {

  async init(options) {
    await super.init(options);
    this.node.style.width = '200px';
    this.enableResize({ min_w: 100, ratio: true });
    this.svg_robots = {};
    this.svg_carrots = {};
    this.pathfindings = {};

    // wait for the SVG document to be loaded before using it
    await new Promise((resolve, reject) => {
      const object = this.content.querySelector('object');
      object.onload = () => {
        this.field = object.getSVGDocument().getElementById('drawing');
        // explicitely initialize object height, webkit does not compute it
        // according to SVG viewBox ratio
        const viewBox = this.field.viewBox.baseVal;
        this.node.style.height = (this.node.clientWidth * viewBox.height / viewBox.width) + 'px';
        this.frame = this.field.getElementById('reference-frame');

        // create SVG robots and carrots
        this.initSvgElements(gs.robots);

        gevents.addHandlerFor(this, 'robots', (robots) => {
          this.initSvgElements(robots);
        });

        // send event when clicking on field
        this.field.addEventListener('mousedown', (ev) => {
          // get drawing position from mouse position
          let pos = this.field.createSVGPoint();
          pos.x = ev.clientX;
          pos.y = ev.clientY;
          pos = pos.matrixTransform(this.frame.getScreenCTM().inverse());
          // send event
          gevents.trigger('field-point-xy', pos.x, pos.y);
        });

        this.bindFrame(null, 'AsservTmStatus', this.updatePosition);
        this.bindFrame(null, 'AsservHoloTmStatus', (frame) => {
          const carrot = this.svg_carrots[frame.robot];
          if (carrot) {
            carrot.setAttributes({x: frame.args.carrot_x, y: frame.args.carrot_y});
          }
        });

        resolve();
      };
    });
  }

  initSvgElements(robots) {
    // Remove existing elements
    this.svg_robots = {};
    this.svg_carrots = {};
    this.pathfindings = {};
    removeElementChildren(this.frame);

    robots.forEach(robot => {
      // create SVG robot
      const svg_robot = this.field.createElement('use');
      const svg_name = robotCategory(robot);
      if (svg_name != 'galipeur' && svg_name != 'pami') {
        return;
      }

      svg_robot.setAttributes({
        'xlink:href': '#def-' + svg_name,
        'class': svg_name,
      });
      this.frame.appendChild(svg_robot);

      // create SVG carrot
      const svg_carrot = this.field.createElement('use');
      svg_carrot.setAttributes({
        'xlink:href': '#def-carrot',
        'class': svg_name,
      });
      this.frame.appendChild(svg_carrot);

      // Note: pathfinding not used anymore (for now)
      // create SVG pathfindings (prepare groups)
      const pathfinding = {
        svg: this.field.createElement('g'),
        svg_vertices: this.field.createElement('g'),
        svg_nodes: this.field.createElement('g'),
      };
      this.frame.appendChild(pathfinding.svg);
      pathfinding.svg.appendChild(pathfinding.svg_vertices);
      pathfinding.svg.appendChild(pathfinding.svg_nodes);

      this.svg_robots[robot] = svg_robot;
      this.svg_carrots[robot] = svg_carrot;
      this.pathfindings[robot] = pathfinding;
    });
  }

  updatePosition(frame) {
    const svg_robot = this.svg_robots[frame.robot];
    if (!svg_robot) {
      return;
    }
    const args = frame.args;
    const a = args.a * 180 / Math.PI;
    svg_robot.setAttributes({
      'transform': `translate(${args.x},${args.y}) rotate(${a})`,
    });
  }

});

