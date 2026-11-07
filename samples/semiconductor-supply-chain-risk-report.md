# Global Semiconductor & EV Supply Chain Risk Assessment

## 1. Executive Summary
Apex Motors Inc. manufactures electric vehicles, including the **Apex Model Z** and **Apex Commercial Van**, at its primary assembly facility, **Austin Gigafactory** in **Texas, United States**. Production depends on multi-tier semiconductor, battery, and rare-earth suppliers across East Asia, Europe, and North America.

## 2. Tier-1 & Tier-2 Semiconductor Dependencies
- **Taiwan Semiconductor Manufacturing Co. (TSMC)** manufactures the **A18 Neural Drive SoC** and **SiC Power Inverter Chip** at **Fab 18 in Tainan, Taiwan**.
- **TSMC** supplies **Continental Automotive Systems** and **Bosch Mobility**, which integrate these chips into the **Autonomous Braking Module (ABM-4)** and **High-Voltage Powertrain Controller**.
- **Bosch Mobility** supplies the **Autonomous Braking Module (ABM-4)** to **Apex Motors Inc.**
- **ASML Holding** (located in **Veldhoven, Netherlands**) supplies **EUV Lithography Systems** to **TSMC**.
- **Shin-Etsu Chemical** (located in **Tokyo, Japan**) supplies **300mm Ultra-Pure Silicon Wafers** to **TSMC** and **Samsung Foundry**.

## 3. Battery & Critical Mineral Supply Chain
- **Albemarle Corporation** operates lithium extraction facilities in **Salar de Atacama, Chile** and supplies **Battery-Grade Lithium Carbonate** to **CATL (Contemporary Amperex Technology Co.)** and **Panasonic Energy**.
- **CATL** manufactures **LFP Prismatic Battery Packs** at its facility in **Ningde, China** and ships them through the **Port of Shanghai** to the **Port of Long Beach** in **California, United States**.
- **MP Materials** operates the **Mountain Pass Rare Earth Facility** in **California, United States** and supplies **Neodymium-Praseodymium (NdPr) Oxide** to **VACUUMSCHMELZE**, which manufactures **Permanent Traction Magnets** for **Apex Motors Inc.**

## 4. Logistics Routes & Port Chokepoints
- Shipments of **A18 Neural Drive SoC** and **LFP Prismatic Battery Packs** transit through the **Taiwan Strait** and the **Port of Kaohsiung**, arriving at the **Port of Los Angeles** and **Port of Long Beach**.
- European components from **Bosch Mobility** and **ASML Holding** ship through the **Port of Rotterdam** in the **Netherlands**.

## 5. Identified Supply Chain Risk Events & Mitigations
- **2026 Taiwan Strait Typhoon & Seismic Disruption** (`RiskEvent`): High risk of wafer fabrication downtime at **Fab 18 in Tainan, Taiwan**, directly impacting **TSMC** and downstream availability of the **A18 Neural Drive SoC** and **Autonomous Braking Module (ABM-4)**.
- **Red Sea & Suez Canal Maritime Rerouting** (`RiskEvent`): Delays shipments between Asian component suppliers and European facilities operated by **Bosch Mobility**, increasing transit lead times by 14–18 days.
- **Port of Long Beach Congestion** (`RiskEvent`): Labor slowdowns and container backlog at the **Port of Long Beach** disrupt delivery of **LFP Prismatic Battery Packs** from **CATL** to the **Austin Gigafactory**.
- **Export Control Regulations on Advanced Semiconductors** (`Regulation`): Tightened trade compliance rules affect cross-border shipments of **EUV Lithography Systems** and advanced AI compute dies.
- **Dual-Sourcing Mitigation Program**: **Apex Motors Inc.** is qualifying **Samsung Foundry** in **Pyeongtaek, South Korea** as a secondary manufacturer for the **A18 Neural Drive SoC** to mitigate single-source exposure to **TSMC**.

