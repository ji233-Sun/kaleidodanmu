import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'effects' })
@Index('uq_effects_slug', ['slug'], { unique: true })
@Index('idx_effects_owner', ['ownerId'])
export class Effect {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_effects',
  })
  id!: number

  @Column({ name: 'owner_id', type: 'integer', nullable: false })
  ownerId!: number

  @Column({ type: 'text', nullable: false })
  slug!: string

  @Column({ type: 'text', nullable: false })
  name!: string

  // 版本本身不可覆盖，发布/回滚只改这三个外键指针
  @Column({ name: 'draft_version_id', type: 'integer', nullable: true })
  draftVersionId!: number | null

  @Column({ name: 'staging_version_id', type: 'integer', nullable: true })
  stagingVersionId!: number | null

  @Column({ name: 'published_version_id', type: 'integer', nullable: true })
  publishedVersionId!: number | null

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date
}
