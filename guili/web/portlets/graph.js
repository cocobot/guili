
const Graph_angleTickCallback = function(value, index, ticks) {
  const n = Math.round(value / (Math.PI/2));
  switch (n) {
    case 0: return '0';
    case 1: return 'π/2';
    case -1: return '\u2212π/2';
    case 2: return 'π';
    case -2: return '\u2212π';
    default:
      if (n % 2 == 0) {
        const k = Math.trunc(n / 2);
        return `${k}`.replace('-', '\u2212') + 'π';
      } else {
        return `${n}`.replace('-', '\u2212') + 'π/2';
      }
  }
};
const Graph_yAngleAxis = {
  suggestedMin: -3.2, suggestedMax: 3.2, position: 'right',
  ticks: {
    stepSize: Math.PI/2,
    callback: Graph_angleTickCallback,
  },
};

Portlet.register('graph', 'Graph', class extends Portlet {
  static default_value_count = 100;

  // Predefined graph configurations
  views = [
    {
      name: 'position',
      pretty_name: 'Position',
      frameName: 'AsservTmStatus',
      type: 'line',
      datasets: [
        { label: 'x', getter: params => params.x, axis: 'yDist' },
        { label: 'y', getter: params => params.y, axis: 'yDist' },
        { label: 'a', getter: params => params.a, axis: 'yAngle' },
      ],
      yaxes: {
        yDist: { suggestedMin: -500.0, suggestedMax: 500. },
        yAngle: Graph_yAngleAxis,
      },
    },
    {
      name: 'speed',
      pretty_name: 'Cartesian speed',
      frameName: 'AsservTmSpeed',
      robotCategories: ['galipeur'],
      type: 'line',
      datasets: [
        { label: 'x', getter: params => params.vx, axis: 'yDist' },
        { label: 'y', getter: params => params.vy, axis: 'yDist' },
        { label: 'a', getter: params => params.va, axis: 'yAngle' },
      ],
      yaxes: {
        yDist: { suggestedMin: -500.0, suggestedMax: 500. },
        yAngle: Graph_yAngleAxis,
      },
    },
    {
      name: 'diff_speed',
      pretty_name: 'Polar speed',
      frameName: 'AsservDiffTmStatus',
      robotCategories: ['pami'],
      type: 'line',
      datasets: [
        { label: 'vdist', getter: params => params.vdist, axis: 'yDist' },
        { label: 'va', getter: params => params.va, axis: 'yAngle' },
      ],
      yaxes: {
        yDist: { suggestedMin: -500.0, suggestedMax: 500. },
        yAngle: Graph_yAngleAxis,
      },
    },
  ];

  async init(options) {
    await super.init(options);
    this.enableResize({ min_w: 100, min_h: 50, on_resize: () => this.resizeChart() });
    this.value_count = options.value_count ? options.value_count : this.constructor.default_value_count;

    //TODO Handle dynamic robots
    this.initViewMenu(gs.robots);

    this.ctx = this.content.querySelector('canvas');

    // set initial view, also create the plot
    this.setView(options.robot ? options.robot : gs.robots[0], options.view ? options.view : this.views[0].name);
  }

  initViewMenu(robots) {
    const items = [];
    robots.forEach(robot => {
      const category = robotCategory(robot);
      this.views.forEach(view => {
        if (!view.robotCategories || view.robotCategories.includes(category)) {
          items.push({
            node: `${robot} › ${view.pretty_name}`,
            onselect: () => this.setView(robot, view.name),
          });
        }
      });
    });
    this.setViewMenu(items);
  }

  getOptions() {
    return { view: this.view.name, robot: this.view_robot };
  }

  updateDataFromFrame(frame) {
    const args = frame.args;
    for (let i=0; i < this.datasets.length; ++i) {
      const d = this.datasets[i].data;
      d.push([this.t, this.view.datasets[i].getter(args)]);
      while (d.length > this.value_count) {
        d.shift();
      }
    }

    //TODO Cleaner axis update
    this.t++;
    this.chart.update('none');
  }

  setView(robot, name) {
    const view = this.views.find(v => v.name == name);
    if (!view) {
      console.error(`Unknown graph view: ${name}`);
      return;
    }

    if (this.view_robot == robot && this.view === view) {
      return;  // No change, nothing to do
    }
    this.view_robot = robot;
    this.view = view;

    // Initialize data
    this.t = 0;
    this.datasets = view.datasets.map(o => ({ data: [], label: o.label, yAxisID: o.axis }));

    // Create the plot
    const cfg = {
      type: view.type,
      data: {
        datasets: this.datasets,
      },
      options: {
        scales: {
          xAxis: {
            type: 'linear',
            bounds: 'data',
          },
          ...view.yaxes,
        },
        responsive: false,  // by the resizer
        maintainAspectRatio: false,
      },
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new Chart(this.ctx, cfg);
    this.resizeChart();

    // Register new frame handlers
    this.unbindFrame();
    this.bindFrame(robot, view.frameName, (frame) => this.updateDataFromFrame(frame));
  }

  resizeChart() {
    if (this.chart) {
      this.chart.resize(this.node.clientWidth, this.node.clientHeight);
    }
  }
});

